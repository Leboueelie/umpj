import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

/** Noms déjà utilisés lors des ventes — simples suggestions, saisie libre. */
export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const r = await pool.query(
    `SELECT "vendeur" FROM "VenteFiche" GROUP BY "vendeur" ORDER BY lower("vendeur") ASC`
  );
  return NextResponse.json(r.rows.map((row: any) => row.vendeur));
}
