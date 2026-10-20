import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const res = await pool.query(
    `SELECT "numeroEdition", count(*)::int AS "nbSessions"
       FROM "SiegePriere"
      GROUP BY "numeroEdition"
      ORDER BY "numeroEdition" DESC`
  );
  return NextResponse.json(res.rows);
}
