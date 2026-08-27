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
}

export interface EntreeZone {
  id: string;
  zoneId: string;
  mois: string; // YYYY-MM
  heureDebut: string;
  heureFin: string;
  participants: number;
}
