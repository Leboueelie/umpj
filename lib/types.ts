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

export interface ChambreDePriere {
  id: string;
  zoneId: string;
  nom: string;
  lieu: string;
  fardeau: string;
  dirigeants: string;
  contacts: string;
  ordre: number;
  actif: boolean;
  createdAt: string;
  zoneNom?: string;
  zoneGroupe?: string;
}

export interface ActionDeGrace {
  id: string;
  type: string; // "comite" | "region"
  comite: string;
  nomFichier: string;
  taille: number;
  createdAt: string;
}

export interface SujetPriere {
  id: string;
  nom: string;
  createdAt: string;
}

export interface EquipePriere {
  id: string;
  sujetId: string;
  zone: string;
  dateDebut: string; // YYYY-MM-DD
  dateFin: string; // YYYY-MM-DD
  tempsMis: number; // en minutes
  nombrePersonnes: number;
  createdAt: string;
}

export interface NuitPriere {
  id: string;
  categorie: string; // "vendredi" | "mardi" | "autre"
  nomCategorie: string | null; // Nom personnalisé pour "autre"
  date: string; // YYYY-MM-DD
  heureDebut: string; // HH:MM
  heureFin: string; // HH:MM
  participants: number;
  tempsMis: number; // en minutes
  volume: number; // tempsMis * participants
  createdAt: string;
}

export interface Jeune {
  id: string;
  categorie: string; // "nation" | "debut-mois" | "dirigeants" | "crppf" | "ministere"
  nomFichier: string;
  taille: number; // en octets
  createdAt: string;
}

export interface Proclamation {
  id: string;
  type: string; // "comite" | "region"
  comite: string;
  nomFichier: string;
  taille: number;
  createdAt: string;
}

export interface SiegePriere {
  id: string;
  nom: string;
  numeroEdition: number;
  orateur: string;
  date: string; // YYYY-MM-DD
  heureDebut: string; // HH:MM
  heureFin: string; // HH:MM
  participants: number;
  tempsMis: number; // en minutes
  createdAt: string;
}
