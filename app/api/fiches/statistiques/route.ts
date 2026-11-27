import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { dateIso, normaliserVendeur } from "@/lib/fiches-calc";

/** Statistiques filtrables par produit, période et vendeur — lecture seule. */
export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const p = new URL(req.url).searchParams;
  const produitId = p.get("produitId");
  const vendeur = p.get("vendeur");
  const du = dateIso(p.get("du")) ?? null;
  const au = dateIso(p.get("au")) ?? null;
  const vendeurNorm = vendeur ? normaliserVendeur(vendeur) : null;

  // Filtres appliqués séparément aux productions et aux ventes : aucune
  // contrainte n'est imposée entre quantités produites et vendues.
  const condProd: string[] = [];
  const paramsProd: any[] = [];
  if (produitId) { paramsProd.push(produitId); condProd.push(`"produitId" = $${paramsProd.length}`); }
  if (du) { paramsProd.push(du); condProd.push(`"dateProduction" >= $${paramsProd.length}`); }
  if (au) { paramsProd.push(au); condProd.push(`"dateProduction" <= $${paramsProd.length}`); }

  const condVente: string[] = [];
  const paramsVente: any[] = [];
  if (produitId) { paramsVente.push(produitId); condVente.push(`"produitId" = $${paramsVente.length}`); }
  if (du) { paramsVente.push(du); condVente.push(`"dateVente" >= $${paramsVente.length}`); }
  if (au) { paramsVente.push(au); condVente.push(`"dateVente" <= $${paramsVente.length}`); }
  if (vendeurNorm) { paramsVente.push(vendeurNorm); condVente.push(`"vendeur" = $${paramsVente.length}`); }

  const whereProd = condProd.length ? ` WHERE ${condProd.join(" AND ")}` : "";
  const whereVente = condVente.length ? ` WHERE ${condVente.join(" AND ")}` : "";

  const actifs = await pool.query(`SELECT COUNT(*)::int AS n FROM "ProduitFiche" WHERE actif`);
  const prod = await pool.query(
    `SELECT COALESCE(SUM(quantite), 0)::int AS q FROM "ProductionFiche"${whereProd}`, paramsProd
  );
  const vente = await pool.query(
    `SELECT COALESCE(SUM(quantite), 0)::int AS q, COALESCE(SUM(montant), 0)::int AS m FROM "VenteFiche"${whereVente}`,
    paramsVente
  );

  // Agrégats par produit fusionnés côté application (évite tout croisement de
  // paramètres SQL et garantit l'absence de contrainte stock/vente).
  const produits = await pool.query(
    `SELECT id, nom, "prixUnitaire" FROM "ProduitFiche" ORDER BY lower(nom) ASC`
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
  const parProduit = produits.rows.map((pRow: any) => ({
    produitId: pRow.id,
    nom: pRow.nom,
    prixUnitaire: pRow.prixUnitaire,
    quantiteProduite: prodMap.get(pRow.id) ?? 0,
    quantiteVendue: venteMap.get(pRow.id)?.q ?? 0,
    montantVentes: venteMap.get(pRow.id)?.m ?? 0,
  }));
  parProduit.sort((a: any, b: any) => b.montantVentes - a.montantVentes || a.nom.localeCompare(b.nom));

  const parVendeur = await pool.query(
    `SELECT "vendeur", SUM(quantite)::int AS "quantiteVendue", SUM(montant)::int AS "montantVentes",
            COUNT(*)::int AS "nbVentes"
     FROM "VenteFiche"${whereVente}
     GROUP BY "vendeur" ORDER BY "montantVentes" DESC`,
    paramsVente
  );

  return NextResponse.json({
    periode: { du, au },
    produitsActifs: actifs.rows[0].n,
    totaux: {
      quantiteProduite: prod.rows[0].q,
      quantiteVendue: vente.rows[0].q,
      montantVentes: vente.rows[0].m,
    },
    parProduit,
    parVendeur: parVendeur.rows,
  });
}
