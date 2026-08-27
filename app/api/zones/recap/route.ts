import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { tempsMisMin } from "@/lib/calc";

export async function GET() {
  const r = await pool.query(
    `SELECT "mois","heureDebut","heureFin","tempsMis","participants" FROM "EntreeZone"`
  );
  const map: Record<string, { mois: string; totP: number; totC: number }> = {};
  for (const row of r.rows) {
    const duree =
      tempsMisMin(row.heureDebut || "", row.heureFin || "") ??
      (row.tempsMis != null ? row.tempsMis : null);
    const p = row.participants || 0;
    const cu = duree != null && p >= 1 ? duree * p : 0;
    const m = row.mois;
    if (!map[m]) map[m] = { mois: m, totP: 0, totC: 0 };
    if (p >= 1) map[m].totP += p;
    map[m].totC += cu;
  }
  const recap = Object.values(map).sort((a, b) => a.mois.localeCompare(b.mois));
  return NextResponse.json(recap);
}
