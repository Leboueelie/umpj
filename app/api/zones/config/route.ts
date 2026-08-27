import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const r = await pool.query(`SELECT "cle","valeur" FROM "ConfigFiche"`);
  const map: Record<string, number> = {};
  for (const row of r.rows) map[row.cle] = Number(row.valeur) || 0;
  return NextResponse.json({
    chambresAbidjan: map["chambresAbidjan"] ?? 0,
    chambresInterieur: map["chambresInterieur"] ?? 0,
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const updates: [string, number][] = [];
  if (typeof body.chambresAbidjan === "number") updates.push(["chambresAbidjan", body.chambresAbidjan]);
  if (typeof body.chambresInterieur === "number") updates.push(["chambresInterieur", body.chambresInterieur]);
  for (const [cle, valeur] of updates) {
    await pool.query(
      `INSERT INTO "ConfigFiche" ("cle","valeur") VALUES ($1,$2)
       ON CONFLICT ("cle") DO UPDATE SET "valeur"=EXCLUDED."valeur"`,
      [cle, valeur]
    );
  }
  return NextResponse.json({ ok: true });
}
