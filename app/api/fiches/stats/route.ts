import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { aggregerParProduit } from "@/lib/fiches-aggregats";
import { lireTotauxFinanciers } from "@/lib/fiches-caisse";

/** Indicateurs du tableau de bord — sans filtre, lecture seule. */
export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const actifs = await pool.query(`SELECT COUNT(*)::int AS n FROM "ProduitFiche" WHERE actif`);
  const { totaux, parProduit } = await aggregerParProduit(pool);
  const caisse = await lireTotauxFinanciers(pool);

  // Produits nécessitant une nouvelle production : objectif défini et manque > 0.
  // Le manque est un indicateur d'aide à la décision, jamais une obligation.
  const produitsACompler = parProduit
    .filter((p) => p.manque !== null && p.manque > 0)
    .sort((a, b) => (b.manque ?? 0) - (a.manque ?? 0));

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
  const dernieresDepenses = await pool.query(
    `SELECT * FROM "DepenseFiche" ORDER BY "dateDepense" DESC, "createdAt" DESC LIMIT 5`
  );

  return NextResponse.json({
    produitsActifs: actifs.rows[0].n,
    quantiteProduite: totaux.quantiteProduite,
    quantiteVendue: totaux.quantiteVendue,
    restant: totaux.restant,
    montantVentes: totaux.montantVentes,
    produitsACompler,
    caisse,
    dernieresProductions: dernieresProductions.rows,
    dernieresVentes: dernieresVentes.rows,
    dernieresDepenses: dernieresDepenses.rows,
  });
}
