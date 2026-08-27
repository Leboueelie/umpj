import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fromMois = (body.fromMois ?? "").toString().trim();
  const toMois = (body.toMois ?? "").toString().trim();
  if (!/^\d{4}-\d{2}$/.test(fromMois) || !/^\d{4}-\d{2}$/.test(toMois))
    return NextResponse.json({ error: "mois invalide (YYYY-MM)." }, { status: 400 });
  if (fromMois === toMois)
    return NextResponse.json({ ok: true });

  const client = await pool.connect();
  try {
    const fromRes = await client.query(`SELECT 1 FROM "EntreeZone" WHERE "mois"=$1 LIMIT 1`, [fromMois]);
    if (!fromRes.rowCount || fromRes.rowCount === 0)
      return NextResponse.json({ error: `Aucune donnée à déplacer pour ${fromMois}.` }, { status: 400 });
    const toRes = await client.query(`SELECT 1 FROM "EntreeZone" WHERE "mois"=$1 LIMIT 1`, [toMois]);
    if (toRes.rowCount && toRes.rowCount > 0)
      return NextResponse.json({ error: `Le mois ${toMois} contient déjà des données.` }, { status: 409 });

    await client.query("BEGIN");
    await client.query(`UPDATE "EntreeZone" SET "mois"=$1 WHERE "mois"=$2`, [toMois, fromMois]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
