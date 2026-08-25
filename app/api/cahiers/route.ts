import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
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
  const body = await req.json().catch(() => ({}));
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
