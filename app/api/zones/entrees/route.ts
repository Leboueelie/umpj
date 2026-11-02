import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parseDureeMinutes } from "@/lib/calc";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { searchParams } = new URL(req.url);
  const mois = searchParams.get("mois");
  const zoneId = searchParams.get("zoneId");
  if (!mois && !zoneId)
    return NextResponse.json({ error: "mois ou zoneId requis" }, { status: 400 });
  if (!mois && zoneId) {
    // Historique complet d'une zone (consultation archives), du plus récent au plus ancien.
    const r = await pool.query(
      `SELECT e.*, z."nom" AS "zoneNom"
       FROM "EntreeZone" e
       JOIN "Zone" z ON z."id" = e."zoneId"
       WHERE e."zoneId" = $1
       ORDER BY e."mois" DESC`,
      [zoneId]
    );
    return NextResponse.json(r.rows);
  }
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

export async function DELETE(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { searchParams } = new URL(req.url);
  const mois = searchParams.get("mois");
  const zoneId = searchParams.get("zoneId");
  const all = searchParams.get("all");
  if (!mois || !/^\d{4}-\d{2}$/.test(mois))
    return NextResponse.json({ error: "mois invalide (YYYY-MM)." }, { status: 400 });

  let supprimees = 0;
  if (zoneId) {
    const d = await pool.query(
      `DELETE FROM "EntreeZone" WHERE "zoneId"=$1 AND "mois"=$2`,
      [zoneId, mois]
    );
    supprimees = d.rowCount ?? 0;
  } else if (all === "true") {
    const d = await pool.query(`DELETE FROM "EntreeZone" WHERE "mois"=$1`, [mois]);
    supprimees = d.rowCount ?? 0;
  } else {
    return NextResponse.json(
      { error: "Précisez zoneId ou all=true pour la suppression." },
      { status: 400 }
    );
  }
  return NextResponse.json({ supprimees });
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const mois = (body.mois ?? "").toString().trim();
  const entrees = Array.isArray(body.entrees) ? body.entrees : [];
  if (!/^\d{4}-\d{2}$/.test(mois))
    return NextResponse.json({ error: "mois invalide (YYYY-MM)." }, { status: 400 });

  // Validation des participants avant toute écriture.
  for (const e of entrees) {
    const zoneId = (e.zoneId ?? "").toString();
    if (!zoneId) continue;
    const raw = e.participants;
    if (raw !== undefined && raw !== null && raw !== "") {
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 0) {
        return NextResponse.json({ error: "Nombre de participants invalide." }, { status: 400 });
      }
    }
  }

  let creees = 0;
  let maj = 0;
  let supprimees = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const e of entrees) {
      const zoneId = (e.zoneId ?? "").toString();
      if (!zoneId) continue;
      const participantsRaw = e.participants;
      const participants = participantsRaw === undefined || participantsRaw === null || participantsRaw === "" ? 0 : Number(participantsRaw);
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
    console.error("Échec de l'enregistrement des entrées :", err);
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  } finally {
    client.release();
  }
}
