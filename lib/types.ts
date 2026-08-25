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
