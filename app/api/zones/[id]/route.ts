import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const nom = (body.nom ?? "").toString().trim();
  if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  if (nom.length > 150)
    return NextResponse.json({ error: "Nom trop long (150 caractères maximum)." }, { status: 400 });
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
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const r = await pool.query(`DELETE FROM "Zone" WHERE "id"=$1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Zone introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
