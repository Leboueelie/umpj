// Moteur de calcul de la Banque d'accomplissements (missions B2 / B2-F).
// Lecture seule : pure fonctions, aucune mutation des objets sources, aucun
// accès base. Les agrégats ne couvrent que les 3 modules du MVP (maisons de
// prière, zones, éditions) et n'existent PAS de total général inter-modules.
//
// Contrat de période : les fonctions statut*/filtrer* attendent une
// PeriodeBanque NORMAISÉE (sortie de normaliserPeriode). Un rapport n'est
// construit qu'avec une période valide : construireRapportBanque lève une
// erreur sinon — jamais de rapport silencieusement valide.
//
// Contrat d'anomalies (3 catégories distinctes, voir SectionBanque) :
//   A = anomaliesDisponibles : toutes les données fournies, hors période ;
//   B = anomaliesPeriode     : seules les lignes retenues (sous-ensemble de A) ;
//   C = nonEvaluables        : lignes à période indéterminable + leurs anomalies.
//
// Frontière PostgreSQL : les colonnes SQL DATE arrivent en objets Date (pilote
// pg, minuit local). Utiliser normaliserDateSql / normaliserEditionSql AVANT
// de transmettre des éditions au moteur.
import type { Ligne, EntreeZone, Edition } from "@/lib/types";
import { cumulMin, fmtDuree, normalizeDate, tempsMisMin } from "./calc.ts";

// ---- Types ----

/** Bornes de période inclusives, au format ISO "YYYY-MM-DD". */
export type PeriodeBanque = { du: string; au: string };

export type SourceBanque = "maisons" | "zones" | "editions";

export type CodeAnomalie =
  | "date-non-normalee"
  | "heure-invalide"
  | "mois-invalide"
  | "periode-invalide"
  | "duree-absente"
  | "duree-invalides"
  | "participants-invalides"
  | "moyenne-zero"
  | "moyenne-invalide"
  | "heures-investies-invalides"
  | "numero-en-doublon";

/** Signalement d'une anomalie : jamais de correction ni d'exclusion silencieuse. */
export interface AnomalieBanque {
  source: SourceBanque;
  code: CodeAnomalie;
  reference: string;
  detail: string;
}

/** Résultat du filtre de période sur une source. */
export type StatutFiltre = "inclus" | "exclus" | "invalide";

export interface FiltreSource<T> {
  retenues: T[];
  /** Lignes dont le champ de période n'est pas exploitable (signalées, jamais perdues). */
  anormales: T[];
}

export interface AgregatMaisons {
  nbLignes: number;
  totalTempsMin: number;
  totalParticipants: number;
  /** RG2 : somme des cumuls, null si aucun cumul calculable sur la période. */
  totalCumulMin: number | null;
}

export interface AgregatZones {
  nbEntrees: number;
  totalTempsMin: number;
  /** Participants valides (entier >= 1), comptés même sans durée (règle 1). */
  totalParticipants: number;
  /** RG2 : temps x participants uniquement si les deux valeurs sont disponibles. */
  totalCumulMin: number | null;
  /** Entrées à tempsMis NULL (signalées via l'anomalie "duree-absente"). */
  nbSansDuree: number;
}

export interface AgregatEditions {
  nbEditions: number;
  /** Σ des valeurs enregistrées (unité : minutes), null si aucune édition. */
  totalHeuresInvestiesMin: number | null;
  /** Σ des participations journalières enregistrées, null si aucun jour. */
  totalParticipantsParJours: number | null;
  nbJoursParticipants: number;
  /**
   * Éditions dont la moyenne enregistrée vaut strictement plus que 0.
   * (Fait pur : un zéro n'est PAS interprété ici — voir l'anomalie
   * "moyenne-zero" : « 0 enregistré — peut correspondre à une donnée non
   * renseignée ». Aucun recalcul de moyenne.)
   */
  nbMoyennePositive: number;
}

/**
 * Catégorie C du contrat d'anomalies : ligne dont la période est
 * indéterminable (date de session illisible, mois mal formé, intervalle
 * d'édition inversé…). La ligne est conservée avec ses anomalies propres ;
 * elle n'apparaît JAMAIS dans anomaliesPeriode.
 */
export interface LigneNonEvaluable {
  source: SourceBanque;
  reference: string;
  /** Anomalies de valeur (et de format) portant sur cette ligne — sous-ensemble de A. */
  anomalies: AnomalieBanque[];
}

/**
 * Une section du rapport, par module. Contrat des anomalies :
 * - `anomaliesDisponibles` (A) : détectées sur TOUTES les données fournies au
 *   moteur, indépendamment de la période — ne JAMAIS être présentées comme
 *   appartenant à la période ;
 * - `anomaliesPeriode` (B) : détectées uniquement sur les lignes retenues ;
 *   sous-ensemble de A pour les anomalies de ligne, avec le détail des
 *   doublons recalculé sur le sous-ensemble retenu ;
 * - `nonEvaluables` (C) : lignes non filtrables + leurs anomalies ; hors B.
 */
export interface SectionBanque<A> {
  nbTotal: number;
  nbRetenues: number;
  agregat: A;
  /** A — qualité des données FOURNIES, hors période. */
  anomaliesDisponibles: AnomalieBanque[];
  /** B — qualité des données DE LA période (sous-ensemble de A). */
  anomaliesPeriode: AnomalieBanque[];
  /** C — lignes à période indéterminable, conservées avec leurs anomalies. */
  nonEvaluables: LigneNonEvaluable[];
}

export interface RapportBanque {
  periode: PeriodeBanque;
  maisons: SectionBanque<AgregatMaisons>;
  zones: SectionBanque<AgregatZones>;
  editions: SectionBanque<AgregatEditions>;
  // Volontairement aucun total général : les modules ne sont pas additionnables.
}

export interface SourcesBanque {
  lignes: readonly Ligne[];
  entrees: readonly EntreeZone[];
  editions: readonly Edition[];
}

// ---- Validation de période ----

/** Date ISO "YYYY-MM-DD" ET calendairalement valide (ex. "2025-02-31" refusée). */
export function estDateIsoCalendaire(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const bissextile = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const joursMois = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= joursMois[mo - 1];
}

/** Mois au format strict "YYYY-MM" (le domaine 01-12 est garanti par la regex). */
export function estMoisYm(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/**
 * Normalise deux bornes (saisie JJ/MM/AAAA acceptée via normalizeDate) en
 * période ISO inclusive. Retourne null si l'une est illisible, non calendaire,
 * ou si du > au.
 */
export function normaliserPeriode(du: string, au: string): PeriodeBanque | null {
  const d = normalizeDate(du);
  const a = normalizeDate(au);
  if (!d || !a) return null;
  if (!estDateIsoCalendaire(d) || !estDateIsoCalendaire(a)) return null;
  if (d > a) return null;
  return { du: d, au: a };
}

/** Vrai si la période est normalisée (sortie de normaliserPeriode). */
export function estPeriodeValide(p: PeriodeBanque): boolean {
  return (
    typeof p === "object" && p !== null &&
    estDateIsoCalendaire(p.du) && estDateIsoCalendaire(p.au) && p.du <= p.au
  );
}

/**
 * Normalise une valeur DATE PostgreSQL (objets Date du pilote pg : minuit
 * local) en "YYYY-MM-DD" civil. Le jour civil est extrait par les getters
 * LOCAUX : le pilote pg construit ces dates à minuit local, les getters
 * locaux retournent donc le jour voulu quel que soit le fuseau de la machine
 * (jamais toISOString() ni getUTC*, susceptibles de décaler le jour).
 * Chaîne ISO "YYYY-MM-DD" valide : préservée telle quelle. Retourne null
 * sinon (date invalide / format non exploitable).
 */
export function normaliserDateSql(v: unknown): string | null {
  if (typeof v === "string") return estDateIsoCalendaire(v) ? v : null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return estDateIsoCalendaire(`${y}-${m}-${d}`) ? `${y}-${m}-${d}` : null;
  }
  return null;
}

/**
 * Normalise un en-tête d'édition lu en base (dateDebut/dateFin, parfois
 * Date pg) avant transmission au moteur. Retourne les dates normalisées ;
 * l'objet d'origine n'est JAMAIS muté (la valeur brute reste consultable
 * pour le signalement d'anomalie ; null = non normalisable).
 */
export function normaliserEditionSql(e: Edition): { dateDebut: string | null; dateFin: string | null } {
  return {
    dateDebut: normaliserDateSql(e.dateDebut),
    dateFin: normaliserDateSql(e.dateFin),
  };
}

/**
 * Filtre d'une date de session (maisons) : bornes inclusives.
 * Précondition : p est une période normalisée (estPeriodeValide).
 */
export function statutLigne(date: string, p: PeriodeBanque): StatutFiltre {
  if (!estDateIsoCalendaire(date)) return "invalide";
  if (date < p.du || date > p.au) return "exclus";
  return "inclus";
}

/**
 * Filtre d'un mois "YYYY-MM" (zones) : inclus si le mois touche la période,
 * même partiellement (les mois de du et de au sont inclus).
 * Précondition : p est une période normalisée (estPeriodeValide).
 */
export function statutMois(mois: string, p: PeriodeBanque): StatutFiltre {
  if (!estMoisYm(mois)) return "invalide";
  const moisDu = p.du.slice(0, 7);
  const moisAu = p.au.slice(0, 7);
  if (mois < moisDu || mois > moisAu) return "exclus";
  return "inclus";
}

/**
 * Filtre d'un intervalle d'édition : chevauchement inclusif avec la période.
 * Période inversée ou bornes illisibles => "invalide".
 * Précondition : p est une période normalisée (estPeriodeValide).
 */
export function statutEdition(dateDebut: string, dateFin: string, p: PeriodeBanque): StatutFiltre {
  if (!estDateIsoCalendaire(dateDebut) || !estDateIsoCalendaire(dateFin)) return "invalide";
  if (dateFin < dateDebut) return "invalide";
  if (dateFin < p.du || dateDebut > p.au) return "exclus";
  return "inclus";
}

/**
 * Découpe les lignes maisons en retenues / anormales.
 * Précondition : p est une période normalisée (estPeriodeValide).
 */
export function filtrerLignes(lignes: readonly Ligne[], p: PeriodeBanque): FiltreSource<Ligne> {
  const retenues: Ligne[] = [];
  const anormales: Ligne[] = [];
  for (const l of lignes) {
    const s = statutLigne(l.date, p);
    if (s === "inclus") retenues.push(l);
    else if (s === "invalide") anormales.push(l);
  }
  return { retenues, anormales };
}

/**
 * Découpe les entrées zones en retenues / anormales.
 * Précondition : p est une période normalisée (estPeriodeValide).
 */
export function filtrerEntrees(entrees: readonly EntreeZone[], p: PeriodeBanque): FiltreSource<EntreeZone> {
  const retenues: EntreeZone[] = [];
  const anormales: EntreeZone[] = [];
  for (const e of entrees) {
    const s = statutMois(e.mois, p);
    if (s === "inclus") retenues.push(e);
    else if (s === "invalide") anormales.push(e);
  }
  return { retenues, anormales };
}

/**
 * Découpe les éditions en retenues / anormales.
 * Précondition : p est une période normalisée (estPeriodeValide) et les
 * dates d'édition ont été normalisées via normaliserDateSql (sinon les
 * valeurs pg Date sont rejetées en "invalide", signalé mais non perdu).
 */
export function filtrerEditions(editions: readonly Edition[], p: PeriodeBanque): FiltreSource<Edition> {
  const retenues: Edition[] = [];
  const anormales: Edition[] = [];
  for (const e of editions) {
    const s = statutEdition(e.dateDebut, e.dateFin, p);
    if (s === "inclus") retenues.push(e);
    else if (s === "invalide") anormales.push(e);
  }
  return { retenues, anormales };
}

// ---- Helpers internes ----

/** "HH:MM" exploitable : composante 0-23 et minutes 0-59 (toMin seul n'impose aucune borne). */
function heureValide(hhmm: unknown): boolean {
  if (typeof hhmm !== "string") return false;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  return h >= 0 && h <= 23 && mn >= 0 && mn <= 59;
}

function entierPositif(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

function dureeZoneValide(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

// ---- Agrégats (règles validées B2 §3) ----

/**
 * Maisons de prière : RG1 (temps mis, passage minuit) et RG2 (cumul) via
 * lib/calc.ts. Décision B2-F 1 — les participants valides (entier >= 1)
 * sont comptés même si les horaires sont illisibles ; la durée et le cumul
 * de la ligne ne le sont jamais dans ce cas (l'anomalie "heure-invalide"
 * reste émise). Les lignes valides sont traitées à l'identique de B2.
 */
export function agregerMaisons(lignes: readonly Ligne[]): AgregatMaisons {
  let totalTempsMin = 0;
  let totalParticipants = 0;
  let cumul = 0;
  let cumulCalculable = false;
  for (const l of lignes) {
    const pValide = entierPositif(l.nombrePersonnes);
    if (pValide) totalParticipants += l.nombrePersonnes;
    if (!heureValide(l.heureDebut) || !heureValide(l.heureFin)) continue;
    const tm = tempsMisMin(l.heureDebut, l.heureFin);
    if (tm === null) continue;
    totalTempsMin += tm;
    const cu = cumulMin(tm, pValide ? l.nombrePersonnes : undefined);
    if (cu !== null) {
      cumul += cu;
      cumulCalculable = true;
    }
  }
  return {
    nbLignes: lignes.length,
    totalTempsMin,
    totalParticipants,
    totalCumulMin: cumulCalculable ? cumul : null,
  };
}

/**
 * Zones : règle 1 — les participants valides sont comptés même si la durée
 * manque. RG2 — le cumul n'est calculé que si durée ET participants sont
 * disponibles. nbSansDuree signale les tempsMis NULL.
 */
export function agregerZones(entrees: readonly EntreeZone[]): AgregatZones {
  let totalTempsMin = 0;
  let totalParticipants = 0;
  let cumul = 0;
  let cumulCalculable = false;
  let nbSansDuree = 0;
  for (const e of entrees) {
    if (e.tempsMis === null || e.tempsMis === undefined) nbSansDuree += 1;
    const pValide = entierPositif(e.participants);
    if (dureeZoneValide(e.tempsMis)) totalTempsMin += e.tempsMis;
    if (pValide) totalParticipants += e.participants;
    if (dureeZoneValide(e.tempsMis) && pValide) {
      const cu = cumulMin(e.tempsMis, e.participants);
      if (cu !== null) {
        cumul += cu;
        cumulCalculable = true;
      }
    }
  }
  return {
    nbEntrees: entrees.length,
    totalTempsMin,
    totalParticipants,
    totalCumulMin: cumulCalculable ? cumul : null,
    nbSansDuree,
  };
}

/**
 * Éditions : aucun cumul temps x participants n'est inventé (règle 2). Seules
 * des sommes de valeurs enregistrées sont exposées. La moyenne enregistrée
 * n'est jamais recalculée ni agrégée (règle 4) : seule la fiche détail
 * l'affichera.
 */
export function agregerEditions(editions: readonly Edition[]): AgregatEditions {
  let totalHeures = 0;
  let heuresValides = false;
  let totalJours = 0;
  let nbJours = 0;
  let nbMoyenne = 0;
  for (const e of editions) {
    if (typeof e.heuresInvesties === "number" && Number.isFinite(e.heuresInvesties) && e.heuresInvesties >= 0) {
      totalHeures += e.heuresInvesties;
      heuresValides = true;
    }
    if (Array.isArray(e.participantsParJour)) {
      for (const j of e.participantsParJour) {
        if (typeof j?.participants === "number" && Number.isFinite(j.participants) && j.participants >= 0) {
          totalJours += j.participants;
          nbJours += 1;
        }
      }
    }
    if (typeof e.moyenneParticipation === "number" && Number.isFinite(e.moyenneParticipation) && e.moyenneParticipation > 0) {
      nbMoyenne += 1;
    }
  }
  return {
    nbEditions: editions.length,
    totalHeuresInvestiesMin: heuresValides ? totalHeures : null,
    totalParticipantsParJours: nbJours > 0 ? totalJours : null,
    nbJoursParticipants: nbJours,
    nbMoyennePositive: nbMoyenne,
  };
}

// ---- Détection d'anomalies (règle 8 : signaler, jamais corriger) ----

export function detecterAnomaliesMaisons(lignes: readonly Ligne[]): AnomalieBanque[] {
  const out: AnomalieBanque[] = [];
  for (const l of lignes) {
    const ref = l.id || l.date || "(sans référence)";
    if (!estDateIsoCalendaire(l.date)) {
      out.push({
        source: "maisons",
        code: "date-non-normalee",
        reference: ref,
        detail: `date non normalisée : "${String(l.date)}"`,
      });
    }
    if (!heureValide(l.heureDebut) || !heureValide(l.heureFin)) {
      out.push({
        source: "maisons",
        code: "heure-invalide",
        reference: ref,
        detail: `horaire non exploitable : ${String(l.heureDebut)} - ${String(l.heureFin)}`,
      });
    }
    if (!entierPositif(l.nombrePersonnes)) {
      out.push({
        source: "maisons",
        code: "participants-invalides",
        reference: ref,
        detail: `participants invalides : ${String(l.nombrePersonnes)}`,
      });
    }
  }
  return out;
}

export function detecterAnomaliesZones(entrees: readonly EntreeZone[]): AnomalieBanque[] {
  const out: AnomalieBanque[] = [];
  for (const e of entrees) {
    const ref = `${e.zoneId || "?"} / ${String(e.mois)}`;
    if (!estMoisYm(e.mois)) {
      out.push({
        source: "zones",
        code: "mois-invalide",
        reference: ref,
        detail: `mois non normalisé : "${String(e.mois)}"`,
      });
    }
    if (e.tempsMis === null || e.tempsMis === undefined) {
      out.push({
        source: "zones",
        code: "duree-absente",
        reference: ref,
        detail: "durée de prière non saisie",
      });
    } else if (!dureeZoneValide(e.tempsMis)) {
      out.push({
        source: "zones",
        code: "duree-invalides",
        reference: ref,
        detail: `durée invalide : ${String(e.tempsMis)}`,
      });
    }
    if (typeof e.participants !== "number" || !Number.isInteger(e.participants) || e.participants < 0) {
      out.push({
        source: "zones",
        code: "participants-invalides",
        reference: ref,
        detail: `participants invalides : ${String(e.participants)}`,
      });
    }
  }
  return out;
}

export function detecterAnomaliesEditions(editions: readonly Edition[]): AnomalieBanque[] {
  const out: AnomalieBanque[] = [];
  const numeros = new Map<number, number>();
  for (const e of editions) {
    numeros.set(e.numero, (numeros.get(e.numero) ?? 0) + 1);
  }
  for (const e of editions) {
    const ref = `édition n°${String(e.numero)}`;
    if (!estDateIsoCalendaire(e.dateDebut) || !estDateIsoCalendaire(e.dateFin) || e.dateFin < e.dateDebut) {
      out.push({
        source: "editions",
        code: "periode-invalide",
        reference: ref,
        detail: `période illisible ou inversée : ${String(e.dateDebut)} -> ${String(e.dateFin)}`,
      });
    }
    if (typeof e.heuresInvesties !== "number" || !Number.isFinite(e.heuresInvesties) || e.heuresInvesties < 0) {
      out.push({
        source: "editions",
        code: "heures-investies-invalides",
        reference: ref,
        detail: `heures investies invalides : ${String(e.heuresInvesties)}`,
      });
    }
    if (
      typeof e.moyenneParticipation !== "number" ||
      !Number.isFinite(e.moyenneParticipation) ||
      e.moyenneParticipation < 0
    ) {
      out.push({
        source: "editions",
        code: "moyenne-invalide",
        reference: ref,
        detail: `moyenne de participation non exploitable : ${String(e.moyenneParticipation)} (affichée telle quelle)`,
      });
    } else if (e.moyenneParticipation === 0) {
      out.push({
        source: "editions",
        code: "moyenne-zero",
        reference: ref,
        detail: "0 enregistré — peut correspondre à une donnée non renseignée (affiché tel quel, jamais recalculé)",
      });
    }
  }
  for (const [numero, n] of numeros) {
    if (n > 1) {
      out.push({
        source: "editions",
        code: "numero-en-doublon",
        reference: `édition n°${String(numero)}`,
        detail: `numéro d'édition présent ${n} fois`,
      });
    }
  }
  return out;
}

// ---- Formatage ----

/**
 * Minutes -> "Xh YY" (lib/calc.ts) ; valeur absente, illisible OU NÉGATIVE
 * -> "—" (jamais un nombre négatif affiché comme durée).
 */
export function fmtDureeBanque(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min) || min < 0) return "—";
  return fmtDuree(min);
}

/**
 * Minutes -> "X H YY MN" (format des éditions existantes) ; absente,
 * illisible OU NÉGATIVE -> "—".
 */
export function fmtMinutesHeures(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min) || min < 0) return "—";
  const m = Math.round(min);
  return `${Math.floor(m / 60)} H ${String(m % 60).padStart(2, "0")} MN`;
}

/** Nombre -> "—" si absent/illisible, sinon sa représentation décimale. */
export function fmtNombre(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return String(v);
}

// ---- Rapport (3 sections, sans total général) ----

/**
 * Construit le rapport de période (3 sections, aucun total général).
 *
 * Contrat d'anomalies (B2-F) :
 * - A `anomaliesDisponibles` : détectées sur TOUTES les données fournies —
 *   qualité des données hors période, jamais présentée comme « de la période » ;
 * - B `anomaliesPeriode` : détectées sur les seules lignes retenues
 *   (sous-ensemble de A ; doublons recomptés sur le sous-ensemble) ;
 * - C `nonEvaluables` : chaque ligne à période indéterminable, avec ses
 *   propres anomalies ; n'entre jamais dans B.
 *
 * Préconditions : `periode` doit être normalisée (sortie de
 * normaliserPeriode) — une période non normalisée lève une erreur (Error)
 * plutôt que de produire un rapport silencieusement valide ; les dates
 * d'édition pg doivent avoir été normalisées via normaliserDateSql.
 * Aucun champ n'est muté (entrées gelées ou non).
 */
export function construireRapportBanque(sources: SourcesBanque, periode: PeriodeBanque): RapportBanque {
  if (!estPeriodeValide(periode)) {
    throw new Error(
      `Période non normalisée : du=${JSON.stringify(periode?.du)} au=${JSON.stringify(periode?.au)} — passer par normaliserPeriode avant construireRapportBanque.`,
    );
  }
  const fl = filtrerLignes(sources.lignes, periode);
  const fe = filtrerEntrees(sources.entrees, periode);
  const fed = filtrerEditions(sources.editions, periode);
  return {
    periode,
    maisons: {
      nbTotal: sources.lignes.length,
      nbRetenues: fl.retenues.length,
      agregat: agregerMaisons(fl.retenues),
      anomaliesDisponibles: detecterAnomaliesMaisons(sources.lignes),
      anomaliesPeriode: detecterAnomaliesMaisons(fl.retenues),
      nonEvaluables: fl.anormales.map((l) => ({
        source: "maisons" as const,
        reference: l.id || l.date || "(sans référence)",
        anomalies: detecterAnomaliesMaisons([l]),
      })),
    },
    zones: {
      nbTotal: sources.entrees.length,
      nbRetenues: fe.retenues.length,
      agregat: agregerZones(fe.retenues),
      anomaliesDisponibles: detecterAnomaliesZones(sources.entrees),
      anomaliesPeriode: detecterAnomaliesZones(fe.retenues),
      nonEvaluables: fe.anormales.map((e) => ({
        source: "zones" as const,
        reference: `${e.zoneId || "?"} / ${String(e.mois)}`,
        anomalies: detecterAnomaliesZones([e]),
      })),
    },
    editions: {
      nbTotal: sources.editions.length,
      nbRetenues: fed.retenues.length,
      agregat: agregerEditions(fed.retenues),
      anomaliesDisponibles: detecterAnomaliesEditions(sources.editions),
      anomaliesPeriode: detecterAnomaliesEditions(fed.retenues),
      nonEvaluables: fed.anormales.map((e) => ({
        source: "editions" as const,
        reference: `édition n°${String(e.numero)}`,
        anomalies: detecterAnomaliesEditions([e]),
      })),
    },
  };
}
