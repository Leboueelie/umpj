import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { tempsMisMin } from "@/lib/calc";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as any;
  const date = (b.date ?? "").toString();
  const heureDebut = (b.heureDebut ?? "").toString();
  const heureFin = (b.heureFin ?? "").toString();
  const nombrePersonnes = parseInt(b.nombrePersonnes, 10);

  if (!date || !heureDebut || !heureFin) {
    return NextResponse.json({ error: "Champs obligatoires manquants." }, { status: 400 });
  }
  if (!nombrePersonnes || nombrePersonnes < 1) {
    return NextResponse.json({ error: "Le nombre de participants doit être ≥ 1." }, { status: 400 });
  }
  if (tempsMisMin(heureDebut, heureFin) === null) {
    return NextResponse.json({ error: "Horaires invalides." }, { status: 400 });
  }

  const r = await pool.query(
    `UPDATE "Ligne" SET date = $1, "heureDebut" = $2, "heureFin" = $3, "nombrePersonnes" = $4
     WHERE id = $5
     RETURNING id, "cahierId", date, "heureDebut", "heureFin", "nombrePersonnes"`,
    [date, heureDebut, heureFin, nombrePersonnes, id]
  );
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const r = await pool.query(`DELETE FROM "Ligne" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
