import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { dateIso, normaliserTexte } from "@/lib/fiches-calc";
import { construireHistorique } from "@/lib/fiches-caisse";
import type { DepenseFiche, VenteFiche } from "@/lib/fiches";

/**
 * Historique chronologique des mouvements de caisse — lecture seule.
 *
 * L'historique est construit à partir de l'intégralité des ventes et dépenses :
 * les filtres (type, dates, recherche) sont appliqués APRÈS le calcul du solde
 * après opération, afin qu'aucun filtre ne modifie artificiellement ce solde.
 */
export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const p = new URL(req.url).searchParams;
  const type = p.get("type"); // vente | depense | null
  const du = dateIso(p.get("du"));
  const au = dateIso(p.get("au"));
  const recherche = normaliserTexte(p.get("q"));

  // Jeu complet, sans filtre SQL : le solde courant reste exact.
  const ventes = (await pool.query(
    `SELECT v.*, p."nom" AS "produitNom" FROM "VenteFiche" v
     JOIN "ProduitFiche" p ON p."id" = v."produitId"
     ORDER BY v."dateVente", v."createdAt", v."id"`
  )).rows as VenteFiche[];
  const depenses = (await pool.query(
    `SELECT * FROM "DepenseFiche" ORDER BY "dateDepense", "createdAt", "id"`
  )).rows as DepenseFiche[];

  let historique = construireHistorique(ventes, depenses);

  // Filtres appliqués sur l'historique déjà calculé.
  if (type === "vente" || type === "depense") {
    historique = historique.filter((m) => m.type === type);
  }
  if (du) historique = historique.filter((m) => m.date >= du);
  if (au) historique = historique.filter((m) => m.date <= au);
  if (recherche) {
    const q = recherche.toLowerCase();
    historique = historique.filter(
      (m) => m.motif.toLowerCase().includes(q) || m.responsable.toLowerCase().includes(q)
    );
  }
  return NextResponse.json(historique.slice(0, 500));
}
