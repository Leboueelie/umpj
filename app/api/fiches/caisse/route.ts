import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { lireTotauxFinanciers } from "@/lib/fiches-caisse";

/** Synthèse de la caisse — ADMIN uniquement, lecture seule. */
export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const caisse = await lireTotauxFinanciers(pool);
  const dernieresDepenses = await pool.query(
    `SELECT * FROM "DepenseFiche" ORDER BY "dateDepense" DESC, "createdAt" DESC LIMIT 5`
  );
  return NextResponse.json({ ...caisse, dernieresDepenses: dernieresDepenses.rows });
}
