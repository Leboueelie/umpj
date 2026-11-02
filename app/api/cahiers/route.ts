import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const c = await pool.query(
    `SELECT id, nom, "createdAt"::text AS "createdAt" FROM "Cahier" ORDER BY "createdAt" ASC`
  );
  const l = await pool.query(
    `SELECT id, "cahierId", date, "heureDebut", "heureFin", "nombrePersonnes"
     FROM "Ligne" ORDER BY date ASC, "heureDebut" ASC`
  );
  return NextResponse.json({ cahiers: c.rows, lignes: l.rows });
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
  const countRes = await pool.query(`SELECT count(*)::int AS n FROM "Cahier"`);
  const id = crypto.randomUUID();
  const r = await pool.query(
    `INSERT INTO "Cahier" (id, nom) VALUES ($1, $2)
     RETURNING id, nom, "createdAt"::text AS "createdAt"`,
    [id, nom || "Cahier " + (countRes.rows[0].n + 1)]
  );
  return NextResponse.json(r.rows[0], { status: 201 });
}
