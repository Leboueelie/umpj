import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const r = await pool.query(`SELECT "cle","valeur" FROM "ConfigFiche"`);
  const map: Record<string, number> = {};
  for (const row of r.rows) map[row.cle] = Number(row.valeur) || 0;
  return NextResponse.json({
    chambresAbidjan: map["chambresAbidjan"] ?? 0,
    chambresInterieur: map["chambresInterieur"] ?? 0,
  });
}

export async function PUT(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
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
