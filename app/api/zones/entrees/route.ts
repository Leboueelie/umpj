import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { parseDureeMinutes } from "@/lib/calc";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mois = searchParams.get("mois");
  if (!mois) return NextResponse.json({ error: "mois requis" }, { status: 400 });
  const r = await pool.query(
    `SELECT e.*, z."nom" AS "zoneNom"
     FROM "EntreeZone" e
     JOIN "Zone" z ON z."id" = e."zoneId"
     WHERE e."mois" = $1
     ORDER BY z."ordre" ASC, z."nom" ASC`,
    [mois]
  );
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mois = (body.mois ?? "").toString().trim();
  const entrees = Array.isArray(body.entrees) ? body.entrees : [];
  if (!/^\d{4}-\d{2}$/.test(mois))
    return NextResponse.json({ error: "mois invalide (YYYY-MM)." }, { status: 400 });

  let creees = 0;
  let maj = 0;
  let supprimees = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const e of entrees) {
      const zoneId = (e.zoneId ?? "").toString();
      if (!zoneId) continue;
      const participants = parseInt(e.participants, 10);
      const tempsMis = parseDureeMinutes((e.tempsMis ?? "").toString()); // saisie directe (minutes)
      const duree = tempsMis;
      const aParticipants = participants >= 1;
      const aDuree = duree !== null;

      if (!aParticipants && !aDuree) {
        // totalement vide -> on retire une éventuelle ligne existante
        const d = await client.query(
          `DELETE FROM "EntreeZone" WHERE "zoneId"=$1 AND "mois"=$2`,
          [zoneId, mois]
        );
        supprimees += d.rowCount ?? 0;
        continue;
      }

      const ex = await client.query(
        `SELECT 1 FROM "EntreeZone" WHERE "zoneId"=$1 AND "mois"=$2`,
        [zoneId, mois]
      );
      if (ex.rowCount && ex.rowCount > 0) {
        await client.query(
          `UPDATE "EntreeZone" SET "tempsMis"=$1,"participants"=$2
           WHERE "zoneId"=$3 AND "mois"=$4`,
          [tempsMis, participants, zoneId, mois]
        );
        maj++;
      } else {
        await client.query(
          `INSERT INTO "EntreeZone" ("id","zoneId","mois","tempsMis","participants")
           VALUES ($1,$2,$3,$4,$5)`,
          [crypto.randomUUID(), zoneId, mois, tempsMis, participants]
        );
        creees++;
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ creees, maj, supprimees });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
