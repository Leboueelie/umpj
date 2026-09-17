import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const r = await pool.query(`DELETE FROM "ActionDeGrace" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
