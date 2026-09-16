import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
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
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const lieu = (body.lieu ?? "").toString().trim();
  const fardeau = (body.fardeau ?? "").toString().trim();
  const dirigeants = (body.dirigeants ?? "").toString().trim();
  const contacts = (body.contacts ?? "").toString().trim();
  const actif = body.actif ?? undefined;

  if (!lieu || !fardeau || !dirigeants)
    return NextResponse.json({ error: "Tous les champs sont obligatoires." }, { status: 400 });

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
  const { id } = await params;
  const r = await pool.query(`DELETE FROM "ChambreDePriere" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Chambre introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
