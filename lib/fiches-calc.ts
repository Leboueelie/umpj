// Calculs et validations purs du module « Productions & Ventes de fiches ».
// Aucune dépendance Next.js ni base de données — testable directement.
//
// Règles métier :
//  - prix et quantités en nombres entiers (FCFA) ;
//  - le montant d'une vente est toujours calculé côté serveur ;
//  - le prix appliqué est historisé dans la vente ;
//  - aucune contrainte entre quantité produite et quantité vendue (pas de stock).

import type {
  ProduitFiche,
  ProductionFiche,
  VenteFiche,
  EtatProduit,
  CategorieDepense,
} from "./fiches";

/** Catégories autorisées pour une dépense de caisse. */
export const CATEGORIES_DEPENSE: readonly CategorieDepense[] = [
  "impression", "papier", "transport", "fournitures",
  "communication", "entretien", "autres",
];

/** Collapse des espaces (trim + espaces successifs en un seul), casse conservée. */
export function normaliserTexte(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ");
}

/** Entier strictement positif, ou null si invalide. */
export function entierPositif(raw: unknown): number | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Entier positif ou nul, ou null si invalide. */
export function entierNonNegatif(raw: unknown): number | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Date ISO AAAA-MM-JJ, validateur calendaire inclus. */
export function dateIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12) return null;
  const jours = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > jours[mo - 1]) return null;
  return s;
}

/** Montant d'une vente = quantité × prix appliqué. Toujours calculé côté serveur. */
export function calculerMontant(quantite: number, prixUnitaire: number): number {
  return quantite * prixUnitaire;
}

/** Reste théorique = produites − vendues. Peut être négatif (autorisé). */
export function calculerReste(quantiteProduite: number, quantiteVendue: number): number {
  return quantiteProduite - quantiteVendue;
}

/**
 * Manque à produire = max(0, cible − reste).
 * `null` signifie « objectif non défini » (cible = 0) : le manque est indéterminé.
 */
export function calculerManque(quantiteCible: number, reste: number): number | null {
  if (quantiteCible === 0) return null;
  return Math.max(0, quantiteCible - reste);
}

/** État d'un produit. Le dépassement de ventes est prioritaire. */
export function determinerEtat(
  quantiteCible: number,
  reste: number,
  manque: number | null
): EtatProduit {
  if (reste < 0) return "depassement_ventes";
  if (quantiteCible === 0) return "objectif_non_defini";
  if (manque !== null && manque > 0) return "production_a_completer";
  return "objectif_atteint";
}

/** Date reçue du serveur (DATE PostgreSQL sérialisé en ISO) → AAAA-MM-JJ. */
export function dateAffichage(raw: unknown): string {
  if (typeof raw !== "string") return "—";
  return raw.slice(0, 10);
}

/** Formatage lisible d'un montant FCFA (groupement par milliers). */
export function formaterFcfa(montant: number): string {
  const n = Number.isSafeInteger(montant) ? montant : 0;
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "-" : ""}${s} FCFA`;
}

/** Clé de tri / recherche d'un nom de produit (insensible à la casse et aux espaces). */
export function cleNomProduit(nom: string): string {
  return normaliserTexte(nom).toLowerCase();
}

/** Nom du vendeur : saisie libre, espaces normalisés, casse préservée. */
export function normaliserVendeur(raw: unknown): string {
  return normaliserTexte(raw);
}

export function validerProduit(input: {
  nom?: unknown;
  prixUnitaire?: unknown;
  quantiteCible?: unknown;
  description?: unknown;
}): string[] {
  const erreurs: string[] = [];
  const nom = normaliserTexte(input.nom);
  if (!nom) erreurs.push("Le nom du produit est obligatoire.");
  else if (nom.length > 150) erreurs.push("Nom du produit trop long (150 caractères maximum).");
  const prix = entierNonNegatif(input.prixUnitaire);
  if (prix === null) erreurs.push("Le prix unitaire doit être un nombre entier positif ou nul.");
  if (
    input.quantiteCible !== undefined &&
    input.quantiteCible !== null &&
    entierNonNegatif(input.quantiteCible) === null
  ) {
    erreurs.push("La quantité cible doit être un nombre entier positif ou nul (0 = non définie).");
  }
  const description = input.description == null ? "" : normaliserTexte(input.description);
  if (description.length > 500) erreurs.push("Description trop longue (500 caractères maximum).");
  return erreurs;
}

export function validerProduction(input: {
  produitId?: unknown;
  quantite?: unknown;
  dateProduction?: unknown;
  responsable?: unknown;
  observation?: unknown;
}): string[] {
  const erreurs: string[] = [];
  if (typeof input.produitId !== "string" || !input.produitId) erreurs.push("Produit invalide.");
  if (entierPositif(input.quantite) === null) erreurs.push("La quantité produite doit être un entier strictement positif.");
  if (!dateIso(input.dateProduction)) erreurs.push("Date de production invalide (AAAA-MM-JJ attendu).");
  const responsable = normaliserTexte(input.responsable);
  if (!responsable) erreurs.push("Le responsable de la production est obligatoire.");
  else if (responsable.length > 120) erreurs.push("Responsable trop long (120 caractères maximum).");
  const observation = input.observation == null ? "" : normaliserTexte(input.observation);
  if (observation.length > 500) erreurs.push("Observation trop longue (500 caractères maximum).");
  return erreurs;
}

export function validerVente(input: {
  produitId?: unknown;
  quantite?: unknown;
  prixUnitaire?: unknown;
  dateVente?: unknown;
  vendeur?: unknown;
  observation?: unknown;
}): string[] {
  const erreurs: string[] = [];
  if (typeof input.produitId !== "string" || !input.produitId) erreurs.push("Produit invalide.");
  const quantite = entierPositif(input.quantite);
  if (quantite === null) erreurs.push("La quantité vendue doit être un entier strictement positif.");
  if (entierNonNegatif(input.prixUnitaire) === null) erreurs.push("Le prix unitaire appliqué doit être un entier positif ou nul.");
  if (!dateIso(input.dateVente)) erreurs.push("Date de vente invalide (AAAA-MM-JJ attendu).");
  const vendeur = normaliserVendeur(input.vendeur);
  if (!vendeur) erreurs.push("Le nom du vendeur est obligatoire.");
  else if (vendeur.length > 120) erreurs.push("Nom du vendeur trop long (120 caractères maximum).");
  const observation = input.observation == null ? "" : normaliserTexte(input.observation);
  if (observation.length > 500) erreurs.push("Observation trop longue (500 caractères maximum).");
  return erreurs;
}

/** Vérifie qu'une date est bien comprise dans une période optionnelle [du, au]. */
export function validerDepense(input: {
  motif?: unknown;
  montant?: unknown;
  dateDepense?: unknown;
  responsable?: unknown;
  categorie?: unknown;
  observation?: unknown;
}): string[] {
  const erreurs: string[] = [];
  const motif = normaliserTexte(input.motif);
  if (!motif) erreurs.push("Le motif de la dépense est obligatoire.");
  else if (motif.length > 200) erreurs.push("Motif trop long (200 caractères maximum).");
  if (entierPositif(input.montant) === null) {
    erreurs.push("Le montant doit être un entier strictement positif (FCFA).");
  }
  if (!dateIso(input.dateDepense)) erreurs.push("Date de dépense invalide (AAAA-MM-JJ attendu).");
  const responsable = normaliserTexte(input.responsable);
  if (!responsable) erreurs.push("Le responsable est obligatoire.");
  else if (responsable.length > 120) erreurs.push("Responsable trop long (120 caractères maximum).");
  if (
    typeof input.categorie !== "string" ||
    !CATEGORIES_DEPENSE.includes(input.categorie as CategorieDepense)
  ) {
    erreurs.push("Catégorie de dépense invalide.");
  }
  const observation = input.observation == null ? "" : normaliserTexte(input.observation);
  if (observation.length > 500) erreurs.push("Observation trop longue (500 caractères maximum).");
  return erreurs;
}

export function dansPeriode(date: string, du: string | null, au: string | null): boolean {
  if (du && date < du) return false;
  if (au && date > au) return false;
  return true;
}

/** Cumuls simples, sans notion de stock. */
export function cumuls(productions: ProductionFiche[], ventes: VenteFiche[]) {
  const quantiteProduite = productions.reduce((s, p) => s + p.quantite, 0);
  const quantiteVendue = ventes.reduce((s, v) => s + v.quantite, 0);
  return {
    quantiteProduite,
    quantiteVendue,
    restant: calculerReste(quantiteProduite, quantiteVendue),
    montantVentes: ventes.reduce((s, v) => s + v.montant, 0),
  };
}

// Réexport de types pour les handlers (évite un import circulaire).
export type { ProduitFiche, ProductionFiche, VenteFiche };
