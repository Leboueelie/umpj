// Types partagés du module « Productions & Ventes de fiches ».
// Aucune dépendance Next.js — importable côté client et côté serveur.

export interface ProduitFiche {
  id: string;
  nom: string;
  prixUnitaire: number; // entier, FCFA
  quantiteCible: number; // entier, 0 = objectif non défini
  description: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionFiche {
  id: string;
  produitId: string;
  produitNom?: string;
  quantite: number;
  dateProduction: string; // YYYY-MM-DD
  responsable: string;
  observation: string;
  auteurId: string | null;
  createdAt: string;
}

export interface VenteFiche {
  id: string;
  produitId: string;
  produitNom?: string;
  quantite: number;
  prixUnitaire: number; // prix appliqué au moment de la vente (historisé)
  montant: number; // quantite * prixUnitaire, calculé côté serveur
  dateVente: string; // YYYY-MM-DD
  vendeur: string;
  observation: string;
  auteurId: string | null;
  createdAt: string;
}

/** Catégories autorisées pour une dépense de caisse. */
export type CategorieDepense =
  | "impression"
  | "papier"
  | "transport"
  | "fournitures"
  | "communication"
  | "entretien"
  | "autres";

/** Dépense prélevée sur le solde général — jamais rattachée à un produit. */
export interface DepenseFiche {
  id: string;
  motif: string;
  montant: number; // entier > 0, FCFA
  dateDepense: string; // YYYY-MM-DD
  responsable: string;
  categorie: CategorieDepense;
  observation: string;
  auteurId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Totaux financiers de la caisse — dérivés des ventes et dépenses réelles. */
export interface TotauxCaisse {
  totalVentes: number;
  totalDepenses: number;
  soldeDisponible: number;
}

/** Ligne de l'historique chronologique de la caisse. */
export interface MouvementCaisse {
  id: string;
  type: "vente" | "depense";
  date: string; // YYYY-MM-DD
  motif: string;
  entree: number; // FCFA (vente)
  sortie: number; // FCFA (dépense)
  soldeApres: number; // FCFA, jamais négatif
  responsable: string;
  createdAt: string;
  referenceId: string;
}

/** États d'un produit au regard de sa cible (priorité au dépassement de ventes). */
export type EtatProduit =
  | "objectif_non_defini"
  | "objectif_atteint"
  | "production_a_completer"
  | "depassement_ventes";

/** Indicateurs dérivés d'un produit — jamais stockés, toujours recalculés. */
export interface SuiviProduit {
  produitId: string;
  nom: string;
  prixUnitaire: number;
  quantiteCible: number;
  quantiteProduite: number;
  quantiteVendue: number;
  reste: number; // produites − vendues, peut être négatif
  manque: number | null; // null si aucun objectif défini (cible = 0)
  montantVentes: number;
  etat: EtatProduit;
}

export interface FichesIndicateurs {
  produitsActifs: number;
  quantiteProduite: number;
  quantiteVendue: number;
  restant: number;
  montantVentes: number;
  produitsACompler: SuiviProduit[];
  caisse: TotauxCaisse;
  dernieresProductions: ProductionFiche[];
  dernieresVentes: VenteFiche[];
  dernieresDepenses: DepenseFiche[];
}

export interface FichesStatistiques {
  periode: { du: string | null; au: string | null };
  produitsActifs: number;
  totaux: {
    quantiteProduite: number;
    quantiteVendue: number;
    restant: number;
    montantVentes: number;
  };
  parProduit: SuiviProduit[];
  caisse: TotauxCaisse;
  parVendeur: Array<{
    vendeur: string;
    quantiteVendue: number;
    montantVentes: number;
    nbVentes: number;
  }>;
}
