import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nom = (body.nom ?? "").toString().trim();
  if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const r = await pool.query(`UPDATE "Zone" SET "nom"=$1 WHERE "id"=$2 RETURNING *`, [
    nom,
    id,
  ]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Zone introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await pool.query(`DELETE FROM "Zone" WHERE "id"=$1`, [id]);
  return NextResponse.json({ ok: true });
}
