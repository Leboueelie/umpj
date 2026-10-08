import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const res = await pool.query(
    `SELECT "numeroEdition", count(*)::int AS "nbSessions"
       FROM "SiegePriere"
      GROUP BY "numeroEdition"
      ORDER BY "numeroEdition" DESC`
  );
  return NextResponse.json(res.rows);
}
