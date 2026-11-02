import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const r = await pool.query(`SELECT * FROM "Zone" ORDER BY "ordre" ASC, "nom" ASC`);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const nom = (body.nom ?? "").toString().trim();
  if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  if (nom.length > 150)
    return NextResponse.json({ error: "Nom trop long (150 caractères maximum)." }, { status: 400 });
  const r = await pool.query(
    `INSERT INTO "Zone" ("id","nom","ordre")
     VALUES ($1,$2,(SELECT COALESCE(MAX("ordre"),0)+1 FROM "Zone"))
     RETURNING *`,
    [crypto.randomUUID(), nom]
  );
  return NextResponse.json(r.rows[0]);
}
