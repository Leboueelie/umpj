import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const r = await pool.query(
    `SELECT c.*, c."but" AS fardeau, z."nom" AS "zoneNom", z."groupe" AS "zoneGroupe"
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
  const nom = (body.nom ?? "").toString().trim();
  const lieu = (body.lieu ?? "").toString().trim();
  const fardeau = (body.fardeau ?? "").toString().trim();
  const dirigeants = (body.dirigeants ?? "").toString().trim();
  const contacts = (body.contacts ?? "").toString().trim();
  const actif = body.actif ?? undefined;

  if (!nom || !lieu || !fardeau || !dirigeants)
    return NextResponse.json({ error: "Tous les champs sont obligatoires." }, { status: 400 });

  const r = await pool.query(
    `UPDATE "ChambreDePriere"
     SET nom = $1, lieu = $2, fardeau = $3, dirigeants = $4, contacts = $5, "actif" = COALESCE($6, "actif")
     WHERE id = $7
     RETURNING *`,
    [nom, lieu, fardeau, dirigeants, contacts, actif, id]
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
