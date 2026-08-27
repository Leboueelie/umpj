import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const r = await pool.query(
    `SELECT z."groupe" AS g,
            SUM(CASE WHEN e."participants" >= 1 THEN e."participants" ELSE 0 END) AS "totP",
            COALESCE(SUM(e."tempsMis"), 0) AS "totT"
     FROM "EntreeZone" e
     JOIN "Zone" z ON z."id" = e."zoneId"
     GROUP BY z."groupe"`
  );
  const out: Record<string, { totP: number; totT: number }> = {
    abidjan: { totP: 0, totT: 0 },
    interieur: { totP: 0, totT: 0 },
  };
  for (const row of r.rows) {
    out[row.g] = { totP: Number(row.totP) || 0, totT: Number(row.totT) || 0 };
  }
  return NextResponse.json(out);
}
