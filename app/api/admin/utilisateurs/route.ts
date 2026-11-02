import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/auth-core.mjs";
import { requireAdmin, journaliser } from "@/lib/auth";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  let r;
  try {
    r = await pool.query(
      `SELECT id, email, nom, role, actif, created_at, updated_at
       FROM "Utilisateur" ORDER BY email`
    );
  } catch {
    r = await pool.query(
      `SELECT id, email, role, actif, created_at, updated_at
       FROM "Utilisateur" ORDER BY email`
    );
    for (const row of r.rows) row.nom = null;
  }
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as any;
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const motDePasse = typeof b?.motDePasse === "string" ? b.motDePasse : "";
  const role = typeof b?.role === "string" ? b.role : "";
  const nom = typeof b?.nom === "string" ? b.nom.trim() : "";

  // Vérifier si la colonne email est nullable (migration FRONT-41 appliquée ou non).
  let emailNullable = false;
  try {
    const c = await pool.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'Utilisateur' AND column_name = 'email'`
    );
    emailNullable = c.rows[0]?.is_nullable === "YES";
  } catch {
    emailNullable = false;
  }

  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }
  if (!emailNullable && !email) {
    return NextResponse.json({ error: "Adresse email requise (migration non appliquée)." }, { status: 400 });
  }
  if (!nom) {
    return NextResponse.json({ error: "Nom complet requis." }, { status: 400 });
  }
  if (nom.length > 120) {
    return NextResponse.json({ error: "Nom complet trop long (120 caractères maximum)." }, { status: 400 });
  }
  if (role !== "ADMIN" && role !== "LECTEUR") {
    return NextResponse.json({ error: "Rôle invalide (ADMIN ou LECTEUR)." }, { status: 400 });
  }
  if (motDePasse.length < 8 || motDePasse.length > 200) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  try {
    const hash = hashPassword(motDePasse);
    let colonneNomDisponible = false;
    try {
      const c = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'Utilisateur' AND column_name = 'nom'`
      );
      colonneNomDisponible = (c.rowCount ?? 0) > 0;
    } catch {
      colonneNomDisponible = false;
    }

    let r;
    if (colonneNomDisponible) {
      r = await pool.query(
        `INSERT INTO "Utilisateur" (email, hash, role, nom)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, nom, role, actif, created_at, updated_at`,
        [email || null, hash, role, nom]
      );
    } else {
      r = await pool.query(
        `INSERT INTO "Utilisateur" (email, hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, email, role, actif, created_at, updated_at`,
        [email, hash, role]
      );
      if (r.rows[0]) r.rows[0].nom = null;
    }
    await journaliser(acces.id, "creation_utilisateur", r.rows[0].id, {
      email,
      role,
      nom,
    });
    return NextResponse.json(r.rows[0], { status: 201 });
  } catch (e) {
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
  }
}
