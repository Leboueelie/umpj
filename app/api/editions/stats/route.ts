import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

// GET /api/editions/stats — agrégats en LECTURE SEULE pour le bilan des éditions
// (mission FRONT-18). Route statique : prend le pas sur /api/editions/[id] pour
// ce chemin exact.
// Additive et rétrocompatible : aucune écriture, aucune route existante modifiée,
// requireAdmin inchangé. La "moyenne générale" reste celle ENREGISTRÉE
// (moyenneParticipation) — elle n'est jamais recalculée ici.

// Les colonnes DATE sont renvoyées par pg sous forme d'objets Date (ISO).
// On normalise en AAAA-MM-JJ pour que les affichages et filtres restent fiables.
function isoDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.split("T")[0].trim().slice(0, 10);
}

interface JourParticipation {
  jour: string;
  date: string;
  participants: number;
}

interface LigneSession {
  date: string;
  nbSessions: number;
  periodes: string;
  dureeMinutes: number;
  participants: number;
}

interface RowEdition {
  id: string;
  numero: number;
  reference: string;
  dateDebut: string;
  dateFin: string;
  libellePeriode: string;
  moyenneParticipation: number;
  heuresInvesties: number;
  participantsParJour: JourParticipation[];
  sessions: LigneSession[];
}

export type BilanEdition = {
  id: string;
  numero: number;
  reference: string;
  dateDebut: string;
  dateFin: string;
  libellePeriode: string;
  // enregistrée — jamais recalculée
  moyenneParticipation: number;
  // Σ participants journaliers (pas un nombre de personnes uniques)
  participationsJournalieres: number;
  // nombre de lignes journalières enregistrées
  joursJournaliers: number;
  lignesSessions: number;
  // Σ nbSessions enregistrées (les 0 s'ajoutent sans effet)
  sessionsPriere: number;
  // Σ durées VALIDES (durée 0 ou manquante exclue)
  tempsInvestiMinutes: number;
  // calculée = temps valides / Σ nbSessions des lignes valides
  dureeMoyenneSession: number | null;
  // lignes avec durée ou nombre de sessions manquants
  anomaliesSessions: number;
  heuresInvestiesStockees: number;
  // stocké ≠ Σ durées enregistrées
  heuresIncoherentes: boolean;
  // même numéro ou même période qu'une autre édition
  doublonPotentiel: boolean;
};

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const r = await pool.query(`SELECT * FROM "Edition"`);
  const rows = r.rows as RowEdition[];

  const editions: BilanEdition[] = rows.map((e) => {
    const jours = Array.isArray(e.participantsParJour) ? e.participantsParJour : [];
    const sess = Array.isArray(e.sessions) ? e.sessions : [];

    const dateDebut = isoDate(e.dateDebut);
    const dateFin = isoDate(e.dateFin);

    const participationsJournalieres = jours.reduce(
      (a, j) => a + (Number(j?.participants) || 0),
      0
    );

    let sessionsPriere = 0;
    let tempsInvesti = 0;
    let nbSessionsValides = 0;
    let anomalies = 0;
    let sommeDureesEnregistrees = 0;
    for (const s of sess) {
      const nb = Number(s?.nbSessions) || 0;
      const dur = Number(s?.dureeMinutes) || 0;
      sessionsPriere += nb;
      sommeDureesEnregistrees += dur;
      if (dur > 0) {
        tempsInvesti += dur;
        nbSessionsValides += nb;
      }
      if (dur <= 0 || nb <= 0) anomalies += 1;
    }

    return {
      id: e.id,
      numero: e.numero,
      reference: e.reference,
      dateDebut,
      dateFin,
      libellePeriode: e.libellePeriode,
      moyenneParticipation: e.moyenneParticipation,
      participationsJournalieres,
      joursJournaliers: jours.length,
      lignesSessions: sess.length,
      sessionsPriere,
      tempsInvestiMinutes: tempsInvesti,
      dureeMoyenneSession:
        nbSessionsValides > 0
          ? Math.round((tempsInvesti / nbSessionsValides) * 10) / 10
          : null,
      anomaliesSessions: anomalies,
      heuresInvestiesStockees: e.heuresInvesties,
      heuresIncoherentes: e.heuresInvesties !== sommeDureesEnregistrees,
      doublonPotentiel: false, // rempli ci-dessous
    };
  });

  // Signalement (non bloquant) des doublons potentiels :
  // même numéro d'édition, ou même période exacte (dates début + fin).
  const parNumero = new Map<number, number>();
  const parDates = new Map<string, number>();
  for (const e of editions) {
    parNumero.set(e.numero, (parNumero.get(e.numero) || 0) + 1);
    const kd = `${e.dateDebut}_${e.dateFin}`;
    parDates.set(kd, (parDates.get(kd) || 0) + 1);
  }
  for (const e of editions) {
    e.doublonPotentiel =
      (parNumero.get(e.numero) || 0) > 1 ||
      (parDates.get(`${e.dateDebut}_${e.dateFin}`) || 0) > 1;
  }

  editions.sort(
    (a, b) =>
      b.dateDebut.localeCompare(a.dateDebut) ||
      b.numero - a.numero ||
      a.id.localeCompare(b.id)
  );

  return NextResponse.json(editions);
}
