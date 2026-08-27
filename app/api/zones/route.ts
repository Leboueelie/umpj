import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const r = await pool.query(`SELECT * FROM "Zone" ORDER BY "ordre" ASC, "nom" ASC`);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const nom = (body.nom ?? "").toString().trim();
  if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const r = await pool.query(
    `INSERT INTO "Zone" ("id","nom","ordre")
     VALUES ($1,$2,(SELECT COALESCE(MAX("ordre"),0)+1 FROM "Zone"))
     RETURNING *`,
    [crypto.randomUUID(), nom]
  );
  return NextResponse.json(r.rows[0]);
}
