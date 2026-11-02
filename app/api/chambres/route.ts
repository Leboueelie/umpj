import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

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
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const zoneId = (body.zoneId ?? "").toString();
  const lieu = (body.lieu ?? "").toString().trim();
  const fardeau = (body.fardeau ?? "").toString().trim();
  const dirigeants = (body.dirigeants ?? "").toString().trim();
  const contacts = (body.contacts ?? "").toString().trim();

  if (!zoneId || !lieu || !fardeau || !dirigeants)
    return NextResponse.json({ error: "Tous les champs sont obligatoires." }, { status: 400 });

  if (lieu.length > 200)
    return NextResponse.json({ error: "Lieu trop long (200 caractères maximum)." }, { status: 400 });
  if (fardeau.length > 500)
    return NextResponse.json({ error: "Fardeau trop long (500 caractères maximum)." }, { status: 400 });
  if (dirigeants.length > 300)
    return NextResponse.json({ error: "Dirigeants trop longs (300 caractères maximum)." }, { status: 400 });
  if (contacts.length > 100)
    return NextResponse.json({ error: "Contacts trop longs (100 caractères maximum)." }, { status: 400 });

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
