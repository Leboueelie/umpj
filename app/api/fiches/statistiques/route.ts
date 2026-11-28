import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { aggregerParProduit, lireFiltres } from "@/lib/fiches-aggregats";
import { lireTotauxFinanciers } from "@/lib/fiches-caisse";

/** Statistiques filtrables par produit, période et vendeur — lecture seule. */
export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const filtres = lireFiltres(new URL(req.url).searchParams);
  const { totaux, parProduit } = await aggregerParProduit(pool, filtres);

  const actifs = await pool.query(`SELECT COUNT(*)::int AS n FROM "ProduitFiche" WHERE actif`);
  const caisse = await lireTotauxFinanciers(pool);

  // Le filtre vendeur ne s'applique qu'aux ventes (aucune contrainte de stock).
  const paramsVendeur: any[] = [];
  let whereVendeur = "";
  if (filtres.vendeur) {
    paramsVendeur.push(filtres.vendeur);
    whereVendeur = ` WHERE "vendeur" = $1`;
  }
  const parVendeur = await pool.query(
    `SELECT "vendeur", SUM(quantite)::int AS "quantiteVendue", SUM(montant)::int AS "montantVentes",
            COUNT(*)::int AS "nbVentes"
     FROM "VenteFiche"${whereVendeur}
     GROUP BY "vendeur" ORDER BY "montantVentes" DESC`,
    paramsVendeur
  );

  return NextResponse.json({
    periode: { du: filtres.du, au: filtres.au },
    produitsActifs: actifs.rows[0].n,
    totaux,
    parProduit,
    caisse,
    parVendeur: parVendeur.rows,
  });
}
