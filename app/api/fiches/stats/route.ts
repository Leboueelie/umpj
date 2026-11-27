import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

/** Indicateurs du tableau de bord — sans filtre, lecture seule. */
export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const actifs = await pool.query(`SELECT COUNT(*)::int AS n FROM "ProduitFiche" WHERE actif`);
  const prod = await pool.query(`SELECT COALESCE(SUM(quantite), 0)::int AS n FROM "ProductionFiche"`);
  const vente = await pool.query(
    `SELECT COALESCE(SUM(quantite), 0)::int AS q, COALESCE(SUM(montant), 0)::int AS m FROM "VenteFiche"`
  );
  const dernieresProductions = await pool.query(
    `SELECT pr.*, p."nom" AS "produitNom" FROM "ProductionFiche" pr
     JOIN "ProduitFiche" p ON p."id" = pr."produitId"
     ORDER BY pr."dateProduction" DESC, pr."createdAt" DESC LIMIT 5`
  );
  const dernieresVentes = await pool.query(
    `SELECT v.*, p."nom" AS "produitNom" FROM "VenteFiche" v
     JOIN "ProduitFiche" p ON p."id" = v."produitId"
     ORDER BY v."dateVente" DESC, v."createdAt" DESC LIMIT 5`
  );

  return NextResponse.json({
    produitsActifs: actifs.rows[0].n,
    quantiteProduite: prod.rows[0].n,
    quantiteVendue: vente.rows[0].q,
    montantVentes: vente.rows[0].m,
    dernieresProductions: dernieresProductions.rows,
    dernieresVentes: dernieresVentes.rows,
  });
}
