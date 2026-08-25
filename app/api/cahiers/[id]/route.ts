import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nom = (body.nom ?? "").toString().trim();
  if (!nom) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  const r = await pool.query(
    `UPDATE "Cahier" SET nom = $1 WHERE id = $2
     RETURNING id, nom, "createdAt"::text AS "createdAt"`,
    [nom, id]
  );
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Cahier introuvable" }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const countRes = await pool.query(`SELECT count(*)::int AS n FROM "Cahier"`);
  if (countRes.rows[0].n <= 1) {
    return NextResponse.json(
      { error: "Impossible de supprimer le dernier cahier." },
      { status: 400 }
    );
  }
  const r = await pool.query(`DELETE FROM "Cahier" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Cahier introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
