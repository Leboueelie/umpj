import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const r = await pool.query(
    `SELECT DISTINCT "mois" FROM "EntreeZone" ORDER BY "mois" DESC`
  );
  return NextResponse.json(r.rows.map((x) => x.mois));
}
