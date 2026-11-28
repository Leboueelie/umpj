// Logique financière centralisée du module Fiches — caisse indépendante des
// produits, des quantités produites, du reste et des objectifs de production.
//
// Règle unique : solde disponible = total des ventes − total des dépenses.
// Aucun solde n'est stocké : il est recalculé à chaque lecture, ce qui garantit
// la cohérence de l'historique après modification ou suppression.

import type { Pool, PoolClient } from "pg";
import type { DepenseFiche, MouvementCaisse, TotauxCaisse, VenteFiche } from "./fiches";

/** Solde disponible — jamais négatif en conditions normales. */
export function calculerSolde(totalVentes: number, totalDepenses: number): number {
  return totalVentes - totalDepenses;
}

/**
 * Lit les deux totaux dans la même transaction que l'opération à protéger.
 *
 * Les sommes SQL sont lues en BIGINT (int64) puis converties avec Number().
 * Limite documentée : Number() reste exact jusqu'à Number.MAX_SAFE_INTEGER
 * (9 007 199 254 740 991 FCFA) ; au-delà, la précision ne serait plus garantie.
 * Aucun montant applicatif n'approche cette limite (montants entiers FCFA).
 */
export async function lireTotauxFinanciers(client: Pool | PoolClient): Promise<TotauxCaisse> {
  const v = await client.query(`SELECT COALESCE(SUM(montant), 0)::bigint AS total FROM "VenteFiche"`);
  const dep = await client.query(`SELECT COALESCE(SUM(montant), 0)::bigint AS total FROM "DepenseFiche"`);
  const totalVentes = Number(v.rows[0].total);
  const totalDepenses = Number(dep.rows[0].total);
  return {
    totalVentes,
    totalDepenses,
    soldeDisponible: calculerSolde(totalVentes, totalDepenses),
  };
}

/**
 * Exécute une opération financière sous verrou exclusif partagé.
 * Le verrou porte sur les ventes ET les dépenses : aucune dépense concurrente
 * ne peut consommer deux fois le même solde, aucune vente ne peut disparaître
 * entre le contrôle et l'écriture.
 */
export async function avecVerrouCaisse<T>(
  pool: Pool,
  operation: (client: PoolClient, totaux: TotauxCaisse) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      'LOCK TABLE "DepenseFiche", "VenteFiche" IN SHARE ROW EXCLUSIVE MODE'
    );
    const totaux = await lireTotauxFinanciers(client);
    const resultat = await operation(client, totaux);
    await client.query("COMMIT");
    return resultat;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Journalise une opération de caisse dans la MÊME transaction (jamais de secret). */
export async function journaliserCaisse(
  client: PoolClient,
  acteur: string,
  action: string,
  cible: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await client.query(
    `INSERT INTO "JournalAdmin" (acteur, action, cible, detail)
     VALUES ($1, $2, $3, $4)`,
    [acteur, action, cible, JSON.stringify(detail)]
  );
}

/**
 * Construit l'historique chronologique de la caisse.
 *
 * Hypothèse actuelle (A4) : le solde initial est nul et l'historique
 * représente exclusivement les mouvements enregistrés dans "VenteFiche"
 * et "DepenseFiche". Aucun solde initial configurable n'est introduit.
 * Tout appelant doit fournir l'intégralité des mouvements pour que le solde
 * après opération soit exact.
 *
 * Le solde après opération est calculé dans l'ordre chronologique, puis la
 * liste est inversée pour l'affichage (plus récent en premier).
 * Aucune entrée artificielle : seules les ventes et dépenses réelles.
 */
export function construireHistorique(
  ventes: VenteFiche[],
  depenses: DepenseFiche[]
): MouvementCaisse[] {
  const mouvements: MouvementCaisse[] = [
    ...ventes.map((v) => ({
      id: `vente-${v.id}`,
      referenceId: v.id,
      type: "vente" as const,
      date: String(v.dateVente).slice(0, 10),
      motif: `Vente — ${v.produitNom ?? "produit"} (${v.quantite} ex.)`,
      entree: v.montant,
      sortie: 0,
      soldeApres: 0,
      responsable: v.vendeur,
      createdAt: v.createdAt,
    })),
    ...depenses.map((d) => ({
      id: `depense-${d.id}`,
      referenceId: d.id,
      type: "depense" as const,
      date: String(d.dateDepense).slice(0, 10),
      motif: d.motif,
      entree: 0,
      sortie: d.montant,
      soldeApres: 0,
      responsable: d.responsable,
      createdAt: d.createdAt,
    })),
  ];

  mouvements.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const c = String(a.createdAt).localeCompare(String(b.createdAt));
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });

  let solde = 0;
  for (const m of mouvements) {
    solde = calculerSolde(solde + m.entree, m.sortie);
    m.soldeApres = solde;
  }
  return mouvements.reverse();
}
