import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zoneId = searchParams.get("zoneId");
  let query = `SELECT c.*, z."nom" AS "zoneNom", z."groupe" AS "zoneGroupe"
               FROM "ChambreDePriere" c
               JOIN "Zone" z ON z."id" = c."zoneId"`;
  const params: any[] = [];
  if (zoneId) {
    query += ` WHERE c."zoneId" = $1`;
    params.push(zoneId);
  }
  query += ` ORDER BY c."ordre" ASC, c."lieu" ASC`;
  const r = await pool.query(query, params);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const zoneId = (body.zoneId ?? "").toString();
  const lieu = (body.lieu ?? "").toString().trim();
  const fardeau = (body.fardeau ?? "").toString().trim();
  const dirigeants = (body.dirigeants ?? "").toString().trim();
  const contacts = (body.contacts ?? "").toString().trim();

  if (!zoneId || !lieu || !fardeau || !dirigeants)
    return NextResponse.json({ error: "Tous les champs sont obligatoires." }, { status: 400 });

  const c = await pool.query(`SELECT id FROM "Zone" WHERE id = $1`, [zoneId]);
  if (c.rowCount === 0)
    return NextResponse.json({ error: "Zone introuvable." }, { status: 404 });

  const maxOrdre = await pool.query(
    `SELECT COALESCE(MAX("ordre"), 0) + 1 AS n FROM "ChambreDePriere" WHERE "zoneId" = $1`,
    [zoneId]
  );
  const ordre = maxOrdre.rows[0].n;

  const id = crypto.randomUUID();
  const r = await pool.query(
    `INSERT INTO "ChambreDePriere" (id, "zoneId", nom, lieu, fardeau, dirigeants, contacts, "ordre")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, zoneId, `CHAMBRE DE PRIERE ${ordre}`, lieu, fardeau, dirigeants, contacts, ordre]
  );
  return NextResponse.json(r.rows[0], { status: 201 });
}
