import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const r = await pool.query(
    `SELECT c.*, z."nom" AS "zoneNom", z."groupe" AS "zoneGroupe"
     FROM "ChambreDePriere" c
     JOIN "Zone" z ON z."id" = c."zoneId"
     WHERE c.id = $1`,
    [id]
  );
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Chambre introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function PUT(req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const lieu = (body.lieu ?? "").toString().trim();
  const fardeau = (body.fardeau ?? "").toString().trim();
  const dirigeants = (body.dirigeants ?? "").toString().trim();
  const contacts = (body.contacts ?? "").toString().trim();
  const actif = body.actif ?? undefined;

  if (!lieu || !fardeau || !dirigeants)
    return NextResponse.json({ error: "Tous les champs sont obligatoires." }, { status: 400 });

  if (lieu.length > 200)
    return NextResponse.json({ error: "Lieu trop long (200 caractères maximum)." }, { status: 400 });
  if (fardeau.length > 500)
    return NextResponse.json({ error: "Fardeau trop long (500 caractères maximum)." }, { status: 400 });
  if (dirigeants.length > 300)
    return NextResponse.json({ error: "Dirigeants trop longs (300 caractères maximum)." }, { status: 400 });
  if (contacts.length > 100)
    return NextResponse.json({ error: "Contacts trop longs (100 caractères maximum)." }, { status: 400 });

  const r = await pool.query(
    `UPDATE "ChambreDePriere"
     SET lieu = $1, fardeau = $2, dirigeants = $3, contacts = $4, "actif" = COALESCE($5, "actif")
     WHERE id = $6
     RETURNING *`,
    [lieu, fardeau, dirigeants, contacts, actif, id]
  );
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Chambre introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const r = await pool.query(`DELETE FROM "ChambreDePriere" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Chambre introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
