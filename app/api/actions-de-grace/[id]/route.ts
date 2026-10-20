import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const r = await pool.query(`DELETE FROM "ActionDeGrace" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
