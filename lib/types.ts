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

export interface EditionJourParticipation {
  jour: string; // ex: "1er jour"
  date: string; // ex: "17 02 2026"
  participants: number;
}

export interface EditionSession {
  date: string;
  nbSessions: number;
  periodes: string; // ex: "09 : 01 - 14 : 49 / 17 : 25 - 21 : 56"
  dureeMinutes: number;
  participants: number;
}

export interface Edition {
  id: string;
  numero: number; // ex: 31
  reference: string; // ex: "RAPPORT UMPJ-CI 001/2026"
  dateDebut: string; // YYYY-MM-DD
  dateFin: string; // YYYY-MM-DD
  libellePeriode: string; // ex: "17 au 22 Février 2026"
  delegationsPresentes: number;
  regionsSpirituelles: number;
  missionnaires1: number;
  missionnaires2: number;
  anciensAbidjan: number;
  epousesAnciensAbidjan: number;
  moyenneParticipation: number;
  heuresInvesties: number; // minutes total
  delegationsExterieures: string[];
  abidjanZones: string[];
  interieurLocalites: string[];
  participantsParJour: EditionJourParticipation[];
  sessions: EditionSession[];
  createdAt: string;
  updatedAt: string;
}
