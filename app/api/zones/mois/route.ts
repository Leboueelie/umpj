import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const r = await pool.query(
    `SELECT DISTINCT "mois" FROM "EntreeZone" ORDER BY "mois" DESC`
  );
  return NextResponse.json(r.rows.map((x) => x.mois));
}
