// Types partagés du module « Productions & Ventes de fiches ».
// Aucune dépendance Next.js — importable côté client et côté serveur.

export interface ProduitFiche {
  id: string;
  nom: string;
  prixUnitaire: number; // entier, FCFA
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

export interface FichesIndicateurs {
  produitsActifs: number;
  quantiteProduite: number;
  quantiteVendue: number;
  montantVentes: number;
  dernieresProductions: ProductionFiche[];
  dernieresVentes: VenteFiche[];
}

export interface FichesStatistiques {
  periode: { du: string | null; au: string | null };
  produitsActifs: number;
  totaux: {
    quantiteProduite: number;
    quantiteVendue: number;
    montantVentes: number;
  };
  parProduit: Array<{
    produitId: string;
    nom: string;
    prixUnitaire: number;
    quantiteProduite: number;
    quantiteVendue: number;
    montantVentes: number;
  }>;
  parVendeur: Array<{
    vendeur: string;
    quantiteVendue: number;
    montantVentes: number;
    nbVentes: number;
  }>;
}
