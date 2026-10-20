import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/auth-core.mjs";
import { requireAdmin, journaliser } from "@/lib/auth";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const r = await pool.query(
    `SELECT id, email, role, actif, created_at, updated_at
     FROM "Utilisateur" ORDER BY email`
  );
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const b = await req.json().catch(() => ({}));
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const motDePasse = typeof b?.motDePasse === "string" ? b.motDePasse : "";
  const role = typeof b?.role === "string" ? b.role : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
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
    const r = await pool.query(
      `INSERT INTO "Utilisateur" (email, hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, actif, created_at, updated_at`,
      [email, hash, role]
    );
    await journaliser(acces.email, "creation_utilisateur", r.rows[0].id, {
      email,
      role,
    });
    return NextResponse.json(r.rows[0], { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Utilisateur_email_key") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cette adresse email." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur de service." }, { status: 500 });
  }
}
