// Logique pure de l'interface de consultation de la Banque (mission B4).
//
// Aucun état React, aucun accès réseau sans injection : fonctions testables
// avec node:test (type stripping natif, sans JSX). Les règles métier restent
// exclusivement dans lib/banque.ts — ce module ne calcule aucun agrégat, il
// prépare les paramètres, présente et formate les valeurs du moteur.
import type { IndexBanque } from "@/lib/banque-api";
import {
  estDateIsoCalendaire,
  estMoisYm,
  fmtDureeBanque,
  fmtMinutesHeures,
  fmtNombre,
  normaliserPeriode,
  type AgregatEditions,
  type AgregatMaisons,
  type AgregatZones,
  type AnomalieBanque,
  type LigneNonEvaluable,
  type PeriodeBanque,
} from "../../lib/banque.ts";
import { isoToDisplay } from "../../lib/calc.ts";

/** Destination après un 401 pendant la consultation (décision B4 §1.3). */
export const LOGIN_BANQUE = "/login?next=/banque";

/** Messages 400 alignés sur le contrat serveur (lib/banque-api.ts). */
export const MSG_PERIODE_ABSENTE = "du et au sont requis.";
export const MSG_PERIODE_INVALIDE =
  "Période invalide : bornes illisibles, non calendaires ou du > au.";

/** Messages d'erreur côté client (jamais de détail interne serveur). */
export const MSG_RESEAU = "Erreur de connexion au serveur.";
export const MSG_JSON = "Réponse inattendue du serveur.";
export const MSG_401 = "Session expirée ou non authentifiée.";
export const MSG_403 = "Accès refusé.";
export const MSG_AUTRE = "Erreur de service.";

/** Plafond d'affichage initial des anomalies par catégorie (décision B4 §1.4). */
export const LIMITE_ANOMALIES = 50;

/** Période affichée/saisie dans les champs, format JJ/MM/AAAA. */
export type PeriodeFr = { du: string; au: string };

/** Résultat d'un appel API Banque, sans jamais exposer de détail serveur. */
export type EtatAppel<T> =
  | { ok: true; donnees: T }
  | {
      ok: false;
      genre: "400" | "401" | "403" | "500" | "json" | "reseau";
      message: string;
    };

export type ValidationPeriode =
  | { ok: true; periode: PeriodeBanque }
  | { ok: false; erreur: string };

/** État d'une section source selon son nombre de données fournies. */
export type EtatDonnees = "attente" | "vide" | "donnees";

/** Une ligne d'indicateur présentée (valeur déjà formatée, jamais recalculée). */
export interface Indicateur {
  label: string;
  valeur: string;
}

// ---- Période ----

function anneeDe(iso: string): number {
  return Number(iso.slice(0, 4));
}

function moisDe(iso: string): number {
  return Number(iso.slice(5, 7));
}

function jourDe(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Jours du mois pour une année/mois données, années bissextiles incluses. */
export function joursDuMois(annee: number, mois: number): number {
  if (mois < 1 || mois > 12) return 0;
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  const table = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[mois - 1];
}

/**
 * Deux ans après `du` : même jour anniversaire, avec repli 29 février -> 28
 * février les années non bissextiles. Règle exacte sur les dates réelles
 * (jamais « + 730 jours »).
 */
function anniversaireDeuxAns(du: string): string {
  const an = anneeDe(du) + 2;
  const mois = moisDe(du);
  const jour = Math.min(jourDe(du), joursDuMois(an, mois));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(an).padStart(4, "0")}-${p(mois)}-${p(jour)}`;
}

/**
 * Période supérieure à deux ans (décision B4 §1.5) : `au` strictement après
 * le deuxième anniversaire de `du`. Bornes ISO calendaires.
 */
export function depasseDeuxAns(du: string, au: string): boolean {
  if (!estDateIsoCalendaire(du) || !estDateIsoCalendaire(au)) return false;
  return au > anniversaireDeuxAns(du);
}

/**
 * Période par défaut : année civile courante (horloge locale du navigateur).
 * Retourne null si l'horloge est inexploitable — jamais de période inventée.
 */
export function periodeCourante(now: Date): PeriodeFr | null {
  const an = now.getFullYear();
  if (!Number.isInteger(an) || an < 1 || an > 9999) return null;
  const s = String(an).padStart(4, "0");
  const du = `01/01/${s}`;
  const au = `31/12/${s}`;
  return normaliserPeriode(du, au) ? { du, au } : null;
}

function isoValideBornes(du: string, au: string): boolean {
  return (
    estDateIsoCalendaire(du) && estDateIsoCalendaire(au) && du <= au
  );
}

/**
 * Repli sur les bornes de l'index (décision B4 §1.1) : période des maisons,
 * sinon mois de zones, sinon bornes d'éditions. Null si aucune source n'est
 * exploitable (l'interface invite alors l'utilisateur à choisir).
 */
export function periodeRepli(index: IndexBanque): PeriodeFr | null {
  const p = index.maisons.periode;
  if (p && isoValideBornes(p.du, p.au)) {
    return { du: isoToDisplay(p.du), au: isoToDisplay(p.au) };
  }

  const mois = index.zones.mois.filter((m) => estMoisYm(m));
  if (mois.length > 0) {
    const premier = mois[0];
    const dernier = mois[mois.length - 1];
    const du = `${premier}-01`;
    const au = `${dernier}-${String(joursDuMois(anneeDe(dernier), moisDe(dernier))).padStart(2, "0")}`;
    if (isoValideBornes(du, au)) {
      return { du: isoToDisplay(du), au: isoToDisplay(au) };
    }
  }

  const eds = index.editions.editions.filter(
    (e) =>
      e.dateDebut !== null &&
      e.dateFin !== null &&
      isoValideBornes(e.dateDebut, e.dateFin)
  );
  if (eds.length > 0) {
    const du = eds.map((e) => e.dateDebut as string).reduce((a, b) => (a < b ? a : b));
    const au = eds.map((e) => e.dateFin as string).reduce((a, b) => (a > b ? a : b));
    return { du: isoToDisplay(du), au: isoToDisplay(au) };
  }

  return null;
}

/**
 * Période initiale : année civile courante en priorité (jamais remplacée par
 * l'année des premières données), repli sur l'index seulement si la première
 * est inexploitable, sinon null (l'utilisateur doit choisir une période).
 */
export function periodeInitiale(
  index: IndexBanque | null,
  now: Date
): PeriodeFr | null {
  return periodeCourante(now) ?? (index ? periodeRepli(index) : null);
}

/**
 * Validation avant envoi à /api/banque/resume : présentes, calendaires,
 * du <= au. Jamais de période invalide envoyée au serveur.
 */
export function validerPeriodeFr(du: string, au: string): ValidationPeriode {
  if (!du.trim() || !au.trim()) {
    return { ok: false, erreur: MSG_PERIODE_ABSENTE };
  }
  const periode = normaliserPeriode(du, au);
  if (!periode) {
    return { ok: false, erreur: MSG_PERIODE_INVALIDE };
  }
  return { ok: true, periode };
}

/** URL de consultation conforme au contrat de normaliserPeriode (ISO). */
export function urlResume(periode: PeriodeBanque): string {
  return `/api/banque/resume?du=${encodeURIComponent(periode.du)}&au=${encodeURIComponent(periode.au)}`;
}

// ---- Appels API ----

/**
 * GET JSON centralisé : mappe les codes HTTP du contrat, isole le message
 * 400 utile, ne propage jamais de corps technique.
 */
export async function appelerBanque<T>(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<EtatAppel<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false, genre: "reseau", message: MSG_RESEAU };
  }

  let corps: unknown = null;
  try {
    const texte = await res.text();
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = null;
  }
  const erreurServeur =
    typeof corps === "object" && corps !== null && "error" in corps &&
    typeof (corps as { error: unknown }).error === "string"
      ? (corps as { error: string }).error
      : null;

  if (!res.ok) {
    if (res.status === 401) return { ok: false, genre: "401", message: MSG_401 };
    if (res.status === 403) return { ok: false, genre: "403", message: MSG_403 };
    if (res.status === 400) {
      return {
        ok: false,
        genre: "400",
        message: erreurServeur ?? MSG_PERIODE_INVALIDE,
      };
    }
    return { ok: false, genre: "500", message: erreurServeur ?? MSG_AUTRE };
  }

  if (typeof corps !== "object" || corps === null) {
    return { ok: false, genre: "json", message: MSG_JSON };
  }
  return { ok: true, donnees: corps as T };
}

// ---- États d'affichage ----

/**
 * État « selon les données fournies » d'une section : indépendant pour
 * chaque source (une section vide n'en efface pas une autre).
 */
export function etatDonnees(nbTotal: number | null | undefined): EtatDonnees {
  if (nbTotal === null || nbTotal === undefined) return "attente";
  return nbTotal > 0 ? "donnees" : "vide";
}

/** Limite d'affichage des anomalies après un nouveau dépliage (lots de 50). */
export function limiteSuivante(actuelle: number, total: number): number {
  if (total <= actuelle) return actuelle;
  return Math.min(actuelle + LIMITE_ANOMALIES, total);
}

/** Nombre d'éléments encore masqués (0 = tout affiché). */
export function restants(total: number, affichees: number): number {
  return Math.max(0, total - affichees);
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Référence d'anomalie affichable (décision B4 §1.6) : les UUID et
 * références techniques sont masqués, les parties lisibles conservées
 * (ex. « édition n°12 », « 2026-03 »). Null si rien de lisible.
 */
export function referenceLisible(reference: string): string | null {
  const parties = reference
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !RE_UUID.test(s) && s !== "?");
  if (parties.length === 0) return null;
  const texte = parties.join(" / ");
  return texte === "(sans référence)" ? null : texte;
}

/** Libellé complet d'une anomalie A/B : détail lisible, référence si utile. */
export function texteAnomalie(an: AnomalieBanque): string {
  const ref = referenceLisible(an.reference);
  return ref && !an.detail.includes(ref) ? `${ref} — ${an.detail}` : an.detail;
}

/** Libellé complet d'une ligne C : détail(s) lisible(s) uniquement. */
export function texteNonEvaluable(l: LigneNonEvaluable): string {
  const details = l.anomalies.map((a) => a.detail).join(" ; ");
  const ref = referenceLisible(l.reference);
  if (ref && !details.includes(ref)) return `${ref} — ${details}`;
  return details;
}

// ---- Textes des catégories (portée métier validée B4 §7) ----

export const LIBELLES_CATEGORIES = {
  a: "A — Anomalies des données fournies",
  b: "B — Anomalies des lignes retenues",
  c: "C — Données à période indéterminable",
} as const;

export const AIDE_CATEGORIES = {
  a: "Anomalies des données fournies au moteur. Elles ne constituent pas un inventaire exhaustif de toutes les anomalies présentes dans la base.",
  b: "Anomalies des lignes retenues pour la période. Elles correspondent au sous-ensemble pertinent du rapport.",
  c: "Données dont la période est indéterminable et leurs anomalies. Ces lignes ne sont pas comptées parmi les lignes retenues pour les agrégats de période.",
} as const;

// ---- Indicateurs (valeurs du moteur, formatées, jamais recalculées) ----

export function indicateursMaisons(a: AgregatMaisons): Indicateur[] {
  return [
    { label: "Lignes retenues", valeur: fmtNombre(a.nbLignes) },
    { label: "Durée cumulée", valeur: fmtDureeBanque(a.totalTempsMin) },
    { label: "Participants", valeur: fmtNombre(a.totalParticipants) },
    { label: "Cumul durée × participants", valeur: fmtDureeBanque(a.totalCumulMin) },
  ];
}

export function indicateursZones(a: AgregatZones): Indicateur[] {
  return [
    { label: "Entrées retenues", valeur: fmtNombre(a.nbEntrees) },
    { label: "Durée cumulée disponible", valeur: fmtDureeBanque(a.totalTempsMin) },
    { label: "Participants", valeur: fmtNombre(a.totalParticipants) },
    { label: "Cumul durée × participants", valeur: fmtDureeBanque(a.totalCumulMin) },
    { label: "Entrées sans durée", valeur: fmtNombre(a.nbSansDuree) },
  ];
}

export function indicateursEditions(a: AgregatEditions): Indicateur[] {
  return [
    { label: "Éditions", valeur: fmtNombre(a.nbEditions) },
    { label: "Heures investies", valeur: fmtMinutesHeures(a.totalHeuresInvestiesMin) },
    { label: "Participants par jour", valeur: fmtNombre(a.totalParticipantsParJours) },
    { label: "Jours avec participants", valeur: fmtNombre(a.nbJoursParticipants) },
    { label: "Éditions avec moyenne > 0", valeur: fmtNombre(a.nbMoyennePositive) },
  ];
}
