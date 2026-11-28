// Agrégation partagée du module Fiches.
// Une seule implémentation des requêtes par produit et du calcul des
// indicateurs dérivés, utilisée par /api/fiches/stats et
// /api/fiches/statistiques. Aucune écriture, aucune contrainte de stock.

import type { Pool } from "pg";
import {
  dateIso,
  normaliserVendeur,
  calculerReste,
  calculerManque,
  determinerEtat,
} from "./fiches-calc";
import type { SuiviProduit } from "./fiches";

export type FiltresAggregation = {
  produitId?: string | null;
  du?: string | null;
  au?: string | null;
  vendeur?: string | null;
};

export type ResultatAggregation = {
  totaux: {
    quantiteProduite: number;
    quantiteVendue: number;
    restant: number;
    montantVentes: number;
  };
  parProduit: SuiviProduit[];
};

/** Normalise les filtres reçus depuis une URL (dates et vendeur). */
export function lireFiltres(params: URLSearchParams): FiltresAggregation {
  return {
    produitId: params.get("produitId") || null,
    du: dateIso(params.get("du")) ?? null,
    au: dateIso(params.get("au")) ?? null,
    vendeur: (() => {
      const v = params.get("vendeur");
      const n = v ? normaliserVendeur(v) : "";
      return n || null;
    })(),
  };
}

/**
 * Calcule les indicateurs par produit sur la sélection demandée.
 * Les filtres s'appliquent séparément aux productions et aux ventes :
 * le reste et le manque sont donc des indicateurs « sur la sélection ».
 */
export async function aggregerParProduit(
  pool: Pool,
  filtres: FiltresAggregation = {}
): Promise<ResultatAggregation> {
  const { produitId, du, au, vendeur } = filtres;

  const condProd: string[] = [];
  const paramsProd: any[] = [];
  if (produitId) { paramsProd.push(produitId); condProd.push(`"produitId" = $${paramsProd.length}`); }
  if (du) { paramsProd.push(du); condProd.push(`"dateProduction" >= $${paramsProd.length}`); }
  if (au) { paramsProd.push(au); condProd.push(`"dateProduction" <= $${paramsProd.length}`); }
  const whereProd = condProd.length ? ` WHERE ${condProd.join(" AND ")}` : "";

  const condVente: string[] = [];
  const paramsVente: any[] = [];
  if (produitId) { paramsVente.push(produitId); condVente.push(`"produitId" = $${paramsVente.length}`); }
  if (du) { paramsVente.push(du); condVente.push(`"dateVente" >= $${paramsVente.length}`); }
  if (au) { paramsVente.push(au); condVente.push(`"dateVente" <= $${paramsVente.length}`); }
  if (vendeur) { paramsVente.push(vendeur); condVente.push(`"vendeur" = $${paramsVente.length}`); }
  const whereVente = condVente.length ? ` WHERE ${condVente.join(" AND ")}` : "";

  const produits = await pool.query(
    `SELECT id, nom, "prixUnitaire", "quantiteCible" FROM "ProduitFiche" ORDER BY lower(nom) ASC`
  );
  const prodParProduit = await pool.query(
    `SELECT "produitId", SUM(quantite)::int AS q FROM "ProductionFiche"${whereProd} GROUP BY "produitId"`,
    paramsProd
  );
  const venteParProduit = await pool.query(
    `SELECT "produitId", SUM(quantite)::int AS q, SUM(montant)::int AS m FROM "VenteFiche"${whereVente} GROUP BY "produitId"`,
    paramsVente
  );

  const prodMap = new Map(prodParProduit.rows.map((r: any) => [r.produitId, r.q]));
  const venteMap = new Map(venteParProduit.rows.map((r: any) => [r.produitId, r]));

  const parProduit: SuiviProduit[] = produits.rows.map((pRow: any) => {
    const quantiteProduite = prodMap.get(pRow.id) ?? 0;
    const quantiteVendue = venteMap.get(pRow.id)?.q ?? 0;
    const montantVentes = venteMap.get(pRow.id)?.m ?? 0;
    const quantiteCible = Number(pRow.quantiteCible) || 0;
    const reste = calculerReste(quantiteProduite, quantiteVendue);
    const manque = calculerManque(quantiteCible, reste);
    return {
      produitId: pRow.id,
      nom: pRow.nom,
      prixUnitaire: pRow.prixUnitaire,
      quantiteCible,
      quantiteProduite,
      quantiteVendue,
      reste,
      manque,
      montantVentes,
      etat: determinerEtat(quantiteCible, reste, manque),
    };
  });
  // Tri historique préservé : montant décroissant, puis nom.
  parProduit.sort((a, b) => b.montantVentes - a.montantVentes || a.nom.localeCompare(b.nom));

  const quantiteProduite = parProduit.reduce((s, p) => s + p.quantiteProduite, 0);
  const quantiteVendue = parProduit.reduce((s, p) => s + p.quantiteVendue, 0);
  const montantVentes = venteParProduit.rows.reduce((s: number, r: any) => s + r.m, 0);

  return {
    totaux: {
      quantiteProduite,
      quantiteVendue,
      restant: calculerReste(quantiteProduite, quantiteVendue),
      montantVentes,
    },
    parProduit,
  };
}
