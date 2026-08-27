import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { tempsMisMin, normalizeHeure, parseDureeMinutes } from "@/lib/calc";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mois = (body.mois ?? "").toString().trim();
  const lignes = Array.isArray(body.lignes) ? body.lignes : [];
  if (!/^\d{4}-\d{2}$/.test(mois))
    return NextResponse.json({ error: "mois invalide (YYYY-MM)." }, { status: 400 });

  let zonesCrees = 0;
  let creees = 0;
  let maj = 0;
  let supprimees = 0;
  let ignorees = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const l of lignes) {
      const nom = String(l.zone ?? "").trim();
      if (!nom) { ignorees++; continue; }
      const zr = await client.query(`SELECT "id" FROM "Zone" WHERE LOWER("nom")=LOWER($1)`, [nom]);
      let zoneId: string;
      if (zr.rowCount && zr.rowCount > 0) {
        zoneId = zr.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO "Zone"("id","nom","ordre")
           VALUES (gen_random_uuid(),$1,(SELECT COALESCE(MAX("ordre"),0)+1 FROM "Zone"))
           RETURNING "id"`,
          [nom]
        );
        zoneId = ins.rows[0].id;
        zonesCrees++;
      }
      const debut = normalizeHeure(String(l.debut ?? ""));
      const fin = normalizeHeure(String(l.fin ?? ""));
      const participants = parseInt(l.participants, 10);
      const tempsMis = parseDureeMinutes(String(l.tempsMis ?? ""));
      const dureeCalculee = tempsMisMin(debut || "", fin || "");
      const duree = dureeCalculee ?? tempsMis;
      const aParticipants = participants >= 1;
      const aDuree = duree !== null;

      if (!aParticipants && !aDuree) {
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
          `UPDATE "EntreeZone" SET "heureDebut"=$1,"heureFin"=$2,"tempsMis"=$3,"participants"=$4
           WHERE "zoneId"=$5 AND "mois"=$6`,
          [debut, fin, tempsMis, participants, zoneId, mois]
        );
        maj++;
      } else {
        await client.query(
          `INSERT INTO "EntreeZone"("id","zoneId","mois","heureDebut","heureFin","tempsMis","participants")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6)`,
          [zoneId, mois, debut, fin, tempsMis, participants]
        );
        creees++;
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ zonesCrees, creees, maj, supprimees, ignorees });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
