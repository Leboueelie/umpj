export interface Cahier {
  id: string;
  nom: string;
}

export interface Ligne {
  id: string;
  cahierId: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  nombrePersonnes: number;
}

export interface Zone {
  id: string;
  nom: string;
  ordre: number;
  groupe: string; // "abidjan" | "interieur"
}

export interface EntreeZone {
  id: string;
  zoneId: string;
  mois: string; // YYYY-MM
  tempsMis: number | null; // temps de prière saisi directement (minutes)
  participants: number;
}
