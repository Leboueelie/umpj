import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/auth-core.mjs";
import { requireAdmin, journaliser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const cible = await pool.query(
    `SELECT id, email, role, actif FROM "Utilisateur" WHERE id = $1`,
    [id]
  );
  if (!cible.rowCount) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }
  const u = cible.rows[0];
  const estMoi = u.id === acces.id;

  const nouvellesValeurs: {
    actif?: boolean;
    role?: string;
    hash?: string;
    revoquer?: boolean;
  } = {};

  if (typeof b?.actif === "boolean") {
    if (estMoi && b.actif === false) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas désactiver votre propre compte." },
        { status: 400 }
      );
    }
    nouvellesValeurs.actif = b.actif;
    if (b.actif === false) nouvellesValeurs.revoquer = true;
  }

  if (typeof b?.role === "string" && b.role !== u.role) {
    if (b.role !== "ADMIN" && b.role !== "LECTEUR") {
      return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
    }
    if (estMoi && b.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Vous ne pouvez pas retirer votre propre rôle administrateur." },
        { status: 400 }
      );
    }
    nouvellesValeurs.role = b.role;
    nouvellesValeurs.revoquer = true;
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

  if (
    nouvellesValeurs.actif === undefined &&
    nouvellesValeurs.role === undefined &&
    nouvellesValeurs.hash === undefined
  ) {
    return NextResponse.json({ error: "Aucune modification demandée." }, { status: 400 });
  }

  // Empêcher de verrouiller le système : il doit rester ≥1 ADMIN actif.
  const perdraAdmin =
    (u.role === "ADMIN" && u.actif) &&
    ((nouvellesValeurs.actif === false) ||
      (nouvellesValeurs.role === "LECTEUR"));
  if (perdraAdmin) {
    const admins = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "Utilisateur" WHERE role = 'ADMIN' AND actif`
    );
    if (admins.rows[0].n <= 1) {
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
  if (nouvellesValeurs.hash !== undefined) {
    sets.push(`hash = $${i++}`);
    vals.push(nouvellesValeurs.hash);
  }
  if (nouvellesValeurs.revoquer) {
    sets.push(`sessions_invalides_apres = now()`);
  }
  sets.push(`updated_at = now()`);
  vals.push(id);

  const r = await pool.query(
    `UPDATE "Utilisateur" SET ${sets.join(", ")} WHERE id = $${i}
     RETURNING id, email, role, actif, created_at, updated_at`,
    vals
  );

  const actions: string[] = [];
  if (nouvellesValeurs.actif !== undefined) {
    actions.push(nouvellesValeurs.actif ? "reactivation" : "desactivation");
  }
  if (nouvellesValeurs.role !== undefined) actions.push("changement_role");
  if (nouvellesValeurs.hash !== undefined) actions.push("reinitialisation_mot_de_passe");
  await journaliser(acces.email, actions.join("+"), u.id, {
    email: u.email,
    role: nouvellesValeurs.role ?? u.role,
    actif: nouvellesValeurs.actif ?? u.actif,
  });

  return NextResponse.json(r.rows[0]);
}
