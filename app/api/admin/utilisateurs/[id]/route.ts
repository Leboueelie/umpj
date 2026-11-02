import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/auth-core.mjs";
import { requireAdmin, journaliser } from "@/lib/auth";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as any;

  // Vérifier si la colonne nom existe (migration appliquée ou non).
  let colonneNomDisponible = false;
  try {
    const c = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Utilisateur' AND column_name = 'nom'`
    );
    colonneNomDisponible = (c.rowCount ?? 0) > 0;
  } catch {
    colonneNomDisponible = false;
  }

  // Validation pure des champs reçus (hors transaction).
  const nouvellesValeurs: {
    actif?: boolean;
    role?: string;
    hash?: string;
    revoquer?: boolean;
    nom?: string | null;
  } = {};

  if (typeof b?.actif === "boolean") {
    nouvellesValeurs.actif = b.actif;
  }

  if (typeof b?.role === "string") {
    if (b.role !== "ADMIN" && b.role !== "LECTEUR") {
      return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
    }
    // La vérification de changement effectif se fait dans la transaction
    // (dépend de u.role). On stocke la valeur demandée ici.
    nouvellesValeurs.role = b.role;
  }

  if (b?.nom !== undefined) {
    if (!colonneNomDisponible) {
      return NextResponse.json({ error: "Migration requise pour le nom complet." }, { status: 400 });
    }
    if (b.nom === null) {
      nouvellesValeurs.nom = null;
    } else if (typeof b.nom === "string") {
      const n = b.nom.trim();
      if (n === "") {
        return NextResponse.json({ error: "Nom complet invalide." }, { status: 400 });
      }
      if (n.length > 120) {
        return NextResponse.json({ error: "Nom complet trop long (120 caractères maximum)." }, { status: 400 });
      }
      nouvellesValeurs.nom = n;
    } else {
      return NextResponse.json({ error: "Nom complet invalide." }, { status: 400 });
    }
  }

  if (typeof b?.motDePasse === "string") {
    if (b.motDePasse.length < 8 || b.motDePasse.length > 200) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }
    nouvellesValeurs.hash = hashPassword(b.motDePasse);
    nouvellesValeurs.revoquer = true;
  }

  // Anti-verrouillage : pas de désactivation ni de rétrogradation de soi-même.
  // (Vérifié ici sur l'id cible ; la vérification complète avec l'état en base
  //  se fait dans la transaction ci-dessous.)

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verrouille tous les comptes ADMIN actifs pour sérialiser les modifications
    // concurrentes d'administrateurs (évite la course sur le « dernier admin »).
    await client.query(
      `SELECT id FROM "Utilisateur" WHERE role = 'ADMIN' AND actif FOR UPDATE`
    );

    let cible;
    try {
      cible = await client.query(
        colonneNomDisponible
          ? `SELECT id, email, nom, role, actif FROM "Utilisateur" WHERE id = $1`
          : `SELECT id, email, role, actif FROM "Utilisateur" WHERE id = $1`,
        [id]
      );
      if (!colonneNomDisponible && cible.rowCount) {
        for (const row of cible.rows) row.nom = null;
      }
    } catch {
      cible = await client.query(`SELECT id, email, role, actif FROM "Utilisateur" WHERE id = $1`, [id]);
      if (cible.rowCount) for (const row of cible.rows) row.nom = null;
    }
    if (!cible.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
    }
    const u = cible.rows[0];
    const estMoi = u.id === acces.id;

    // Ignorer les modifications sans effet réel.
    if (nouvellesValeurs.actif !== undefined && nouvellesValeurs.actif === u.actif) {
      delete nouvellesValeurs.actif;
    }
    if (nouvellesValeurs.role !== undefined && nouvellesValeurs.role === u.role) {
      delete nouvellesValeurs.role;
    }
    if (nouvellesValeurs.nom !== undefined && nouvellesValeurs.nom === u.nom) {
      delete nouvellesValeurs.nom;
    }
    if (estMoi && nouvellesValeurs.actif === false) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Vous ne pouvez pas désactiver votre propre compte." },
        { status: 400 }
      );
    }
    if (nouvellesValeurs.actif === false) nouvellesValeurs.revoquer = true;
    if (nouvellesValeurs.role === "LECTEUR" && u.role === "ADMIN") nouvellesValeurs.revoquer = true;
    if (nouvellesValeurs.hash !== undefined) nouvellesValeurs.revoquer = true;

    if (estMoi && nouvellesValeurs.role === "LECTEUR") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Vous ne pouvez pas retirer votre propre rôle administrateur." },
        { status: 400 }
      );
    }

    if (
      nouvellesValeurs.actif === undefined &&
      nouvellesValeurs.role === undefined &&
      nouvellesValeurs.hash === undefined &&
      nouvellesValeurs.nom === undefined
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Aucune modification demandée." }, { status: 400 });
    }

    // Empêcher de verrouiller le système : il doit rester ≥1 ADMIN actif.
    const perdraAdmin =
      u.role === "ADMIN" &&
      u.actif &&
      (nouvellesValeurs.actif === false || nouvellesValeurs.role === "LECTEUR");
    if (perdraAdmin) {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS n FROM "Utilisateur" WHERE role = 'ADMIN' AND actif`
      );
      if (admins.rows[0].n <= 1) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Impossible : ce compte est le dernier administrateur actif." },
          { status: 400 }
        );
      }
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (nouvellesValeurs.actif !== undefined) {
      sets.push(`actif = $${i++}`);
      vals.push(nouvellesValeurs.actif);
    }
    if (nouvellesValeurs.role !== undefined) {
      sets.push(`role = $${i++}`);
      vals.push(nouvellesValeurs.role);
    }
    if (colonneNomDisponible && nouvellesValeurs.nom !== undefined) {
      sets.push(`nom = $${i++}`);
      vals.push(nouvellesValeurs.nom);
    }
    if (nouvellesValeurs.hash !== undefined) {
      sets.push(`hash = $${i++}`);
      vals.push(nouvellesValeurs.hash);
    }
    if (nouvellesValeurs.revoquer) {
      sets.push(`sessions_invalides_apres = now()`);
    }
    sets.push(`updated_at = now()`);
    vals.push(id);

    const r = await client.query(
      `UPDATE "Utilisateur" SET ${sets.join(", ")} WHERE id = $${i}
       RETURNING id, email, nom, role, actif, created_at, updated_at`,
      vals
    );

    const actions: string[] = [];
    if (nouvellesValeurs.actif !== undefined) {
      actions.push(nouvellesValeurs.actif ? "reactivation" : "desactivation");
    }
    if (nouvellesValeurs.role !== undefined) actions.push("changement_role");
    if (nouvellesValeurs.hash !== undefined) actions.push("reinitialisation_mot_de_passe");

    // Journal dans la même transaction.
    await client.query(
      `INSERT INTO "JournalAdmin" (acteur, action, cible, detail)
       VALUES ($1, $2, $3, $4)`,
      [acces.id, actions.join("+"), u.id, JSON.stringify({
        email: u.email,
        role: nouvellesValeurs.role ?? u.role,
        actif: nouvellesValeurs.actif ?? u.actif,
        nom: nouvellesValeurs.nom ?? u.nom,
      })]
    );

    await client.query("COMMIT");
    return NextResponse.json(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const code = (e as any)?.code;
    const msg = e instanceof Error ? e.message : "";
    if (code === "23505" || msg.includes("Utilisateur_nom_normalise_key")) {
      return NextResponse.json(
        { error: "Ce nom de connexion existe déjà." },
        { status: 409 }
      );
    }
    if (msg.includes("Utilisateur_email_key") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cette adresse email." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur de service." }, { status: 500 });
  } finally {
    client.release();
  }
}
