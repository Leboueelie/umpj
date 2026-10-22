// Service en lecture seule des API Banque (mission B3).
//
// Aucune écriture SQL, aucune dépendance Next : les fonctions reçoivent une
// `RequeteDb` injectée (testable sans base), les routes fournissent le pool.
// Contrat HTTP des routes (voir aussi le JSDoc de chaque route.ts) :
//   - 401 : session absente / compte désactivé / révocation (requireUser) ;
//   - 400 : paramètres de période absents, illisibles, non calendaires ou du > au ;
//   - 500 : { error: "Erreur de service." } — jamais de détail interne (SQL,
//           hôte, identifiant de base) fuité côté client ;
//   - 200 : index (construireIndexBanque) ou RapportBanque (moteur B2-F).
//
// Périmètre des données chargées (choix de cadrage, jamais de perte muette) :
//   - Ligne      : toute date NON calendaire — forme incorrecte OU "YYYY-MM-DD"
//                  qui n'existe pas (ex. "2025-13-01", "2025-02-31") — est
//                  chargée QUELLE QUE SOIT la période (B3-C) ; les dates
//                  valides le sont si leur mois est couvert par la période ;
//   - EntreeZone : mois mal formé ou impossible (toujours) + mois entre du/au ;
//   - Edition    : intervalle inversé (toujours) + chevauchement avec la période.
// Une ligne calendairement valide mais hors période n'est pas une anomalie
// (statut « exclu » du moteur) : elle n'est pas chargée. Toute ligne à période
// indéterminable — y compris une date ISO calendairement impossible — est
// chargée et remonte en catégorie C.
//
// Portée des catégories d'anomalies (A/B/C) : elles couvrent les données
// EFFECTIVEMENT fournies au moteur par ces requêtes, pas l'intégralité des
// tables — anomaliesDisponibles n'est PAS un inventaire exhaustif de la base.
// Une ligne valide hors période n'est ni fournie ni signalée : son anomalie
// éventuelle n'apparaît que si une période qui la couvre est demandée.
//
// Limites de volume (pagination future, hors périmètre B3) :
//   - agrégation en mémoire sur un sous-ensemble borné par la période (pas de
//     cache, pas d'agrégat SQL précalculé) ; une période très large (plusieurs
//     années) charge tout l'historique correspondant ;
//   - pistes : index composite sur "Ligne"("date") et "EntreeZone"("mois")
//     (couverts partiellement par les index existants), agrégats SQL GROUP BY
//     par section, puis pagination des lignes détaillées côté UI (B5) ;
//   - l'index (/api/banque/index) ne charge qu'un compteur par table, des dates
//     distinctes et la liste des éditions : volume faible par nature.
import type { Edition, EditionJourParticipation, EntreeZone, Ligne } from "@/lib/types";
import {
  construireRapportBanque,
  estDateIsoCalendaire,
  estMoisYm,
  normaliserDateSql,
  normaliserPeriode,
  type PeriodeBanque,
  type RapportBanque,
} from "./banque.ts";

// ---- Types de service ----

export type LigneRequete = Record<string, unknown>;

/** Signature minimale injectée (pool.query compatible) : lecture uniquement. */
export type RequeteDb = (
  texte: string,
  params?: readonly unknown[]
) => Promise<{ rows: LigneRequete[] }>;

export type ResultatService<T> =
  | { ok: true; donnees: T }
  | { ok: false; status: 400 | 500; erreur: string };

export type ResultatPeriode =
  | { ok: true; periode: PeriodeBanque }
  | { ok: false; erreur: string };

export interface EditionDisponible {
  numero: number;
  /** Normalisée "YYYY-MM-DD" ; null si la valeur source n'est pas exploitable. */
  dateDebut: string | null;
  dateFin: string | null;
}

export interface IndexBanque {
  maisons: { donnees: boolean; nbLignes: number; periode: PeriodeBanque | null };
  zones: { donnees: boolean; nbEntrees: number; mois: string[] };
  editions: { donnees: boolean; nbEditions: number; editions: EditionDisponible[] };
}

export interface BrutIndexBanque {
  nbLignes: number;
  datesLignes: readonly string[];
  nbEntrees: number;
  moisEntrees: readonly string[];
  editions: readonly LigneRequete[];
}

// ---- Requêtes (lecture seule, SQL constant ou paramétré) ----

const SQL_NB_LIGNES = `SELECT count(*)::int AS nb FROM "Ligne"`;
const SQL_DATES_LIGNES =
  `SELECT DISTINCT date FROM "Ligne" WHERE date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' ORDER BY date ASC`;
const SQL_NB_ENTREES = `SELECT count(*)::int AS nb FROM "EntreeZone"`;
const SQL_MOIS_ENTREES = `SELECT DISTINCT mois FROM "EntreeZone" ORDER BY mois ASC`;
const SQL_INDEX_EDITIONS =
  `SELECT "numero","dateDebut","dateFin" FROM "Edition" ORDER BY "dateDebut" DESC, "numero" DESC`;

// Colonnes TEXT sans contrainte de domaine : une date de maison peut être
// malformée OU calendairement impossible (ex. "2025-02-31", "2025-13-01").
// Le CASE garantit deux propriétés (B3-C) :
//   1. aucune erreur de conversion possible — les casts ::int ne sont
//      évalués qu'après la branche « forme incorrecte » (CASE n'évalue pas
//      les branches non prises, contrairement à OR dont l'ordre d'évaluation
//      n'est pas garanti) ;
//   2. toute date non calendaire est chargée POUR TOUTE période : la
//      validation (mois, jours du mois, bissextile) est calquée sur
//      estDateIsoCalendaire du moteur — accord vérifié par les tests SQL.
// Une date valide reste bornée par son mois (ELSE : fenêtre $1..$2).
export const SQL_LIGNES_PERIODE =
  `SELECT "id","date","heureDebut","heureFin","nombrePersonnes" FROM "Ligne"
   WHERE CASE
     WHEN "date" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN TRUE
     WHEN substring("date", 6, 2)::int NOT BETWEEN 1 AND 12 THEN TRUE
     WHEN substring("date", 9, 2)::int NOT BETWEEN 1 AND 31 THEN TRUE
     WHEN substring("date", 9, 2)::int > CASE substring("date", 6, 2)
           WHEN '02' THEN CASE WHEN (substring("date", 1, 4)::int % 400 = 0
             OR (substring("date", 1, 4)::int % 4 = 0
               AND substring("date", 1, 4)::int % 100 <> 0)) THEN 29 ELSE 28 END
           WHEN '04' THEN 30 WHEN '06' THEN 30 WHEN '09' THEN 30 WHEN '11' THEN 30
           ELSE 31 END
       THEN TRUE
     ELSE substring("date", 1, 7) BETWEEN $1 AND $2
   END
   ORDER BY "date" ASC, "heureDebut" ASC`;
export const SQL_ENTREES_PERIODE =
  `SELECT "id","zoneId","mois","tempsMis","participants" FROM "EntreeZone"
   WHERE ("mois" !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      OR ("mois" BETWEEN $1 AND $2)
   ORDER BY "mois" ASC, "zoneId" ASC`;
export const SQL_EDITIONS_PERIODE =
  `SELECT "id","numero","dateDebut","dateFin","heuresInvesties","moyenneParticipation","participantsParJour"
   FROM "Edition"
   WHERE ("dateFin" < "dateDebut")
      OR ("dateFin" >= $1 AND "dateDebut" <= $2)
   ORDER BY "dateDebut" ASC, "numero" ASC`;

const ERREUR_SERVICE = "Erreur de service.";
const ERREUR_PERIODE_ABSENTE = "du et au sont requis.";
const ERREUR_PERIODE_INVALIDE =
  "Période invalide : bornes illisibles, non calendaires ou du > au.";

// ---- Validation des paramètres de période ----

/**
 * Lit les paramètres `du` et `au` (saisie JJ/MM/AAAA ou ISO acceptée par
 * normaliserPeriode). Absence → message « requis » ; forme ou ordre incorrects
 * → message « invalide ». Jamais de rapport construit sur une période brute.
 */
export function lirePeriodeDepuisParams(
  params: Pick<URLSearchParams, "get">
): ResultatPeriode {
  const du = params.get("du");
  const au = params.get("au");
  if (du === null || au === null) {
    return { ok: false, erreur: ERREUR_PERIODE_ABSENTE };
  }
  const periode = normaliserPeriode(du, au);
  if (!periode) {
    return { ok: false, erreur: ERREUR_PERIODE_INVALIDE };
  }
  return { ok: true, periode };
}

// ---- Mapping des lignes DB vers les types du moteur (colonnes minimales) ----

// Seules les colonnes lues par le moteur sont sélectionnées. Les champs du
// type qui ne sont pas chargés prennent une valeur neutre : ils ne sont ni
// utilisés par le moteur, ni sérialisés dans la réponse (le rapport ne
// contient que compteurs, agrégats et anomalies).

function versLigne(r: LigneRequete): Ligne {
  return {
    id: r.id as string,
    cahierId: "", // non chargée (inutilisée par le moteur, jamais renvoyée)
    date: r.date as string,
    heureDebut: r.heureDebut as string,
    heureFin: r.heureFin as string,
    nombrePersonnes: r.nombrePersonnes as number,
  };
}

function versEntreeZone(r: LigneRequete): EntreeZone {
  return {
    id: r.id as string,
    zoneId: r.zoneId as string,
    mois: r.mois as string,
    tempsMis: (r.tempsMis ?? null) as number | null,
    participants: r.participants as number,
  };
}

function versEdition(r: LigneRequete): Edition {
  // Frontière pg (B2-F) : les colonnes DATE arrivent en objets Date.
  const dateDebut = normaliserDateSql(r.dateDebut);
  const dateFin = normaliserDateSql(r.dateFin);
  return {
    id: r.id as string,
    numero: r.numero as number,
    reference: "", // non chargée (inutilisée par le moteur, jamais renvoyée)
    // Date non normalisable → valeur d'origine conservée : le moteur la
    // classe en « periode-invalide » (catégorie C), jamais corrigée en silence.
    dateDebut: dateDebut ?? (r.dateDebut as string),
    dateFin: dateFin ?? (r.dateFin as string),
    libellePeriode: "",
    delegationsPresentes: 0,
    regionsSpirituelles: 0,
    missionnaires1: 0,
    missionnaires2: 0,
    anciensAbidjan: 0,
    epousesAnciensAbidjan: 0,
    moyenneParticipation: r.moyenneParticipation as number,
    heuresInvesties: r.heuresInvesties as number,
    delegationsExterieures: [],
    abidjanZones: [],
    interieurLocalites: [],
    participantsParJour: Array.isArray(r.participantsParJour)
      ? (r.participantsParJour as EditionJourParticipation[])
      : [],
    sessions: [],
    createdAt: "",
    updatedAt: "",
  };
}

// ---- GET /api/banque/index ----

/**
 * Construit l'index à partir des lignes brutes (pur, testable sans base).
 *
 * Périmètre — décision B3-C : les dates non calendaires ne sont exposées dans
 * AUCUNE métadonnée de l'index (contrat inchangé, aucun champ ajouté).
 * Conséquences assumées :
 * - `maisons.periode` (bornes de filtre UI) ne contient que des dates
 *   calendairement valides — jamais de borne inutilisable ;
 * - `maisons.nbLignes` est le compteur global de la table (count(*)) : il
 *   peut donc excéder `nbTotal` d'un rapport de période (borné par les mois
 *   demandés) et inclure des dates non calendaire — c'est un indice de
 *   volume, pas un compteur d'anomalies ;
 * - la détection des dates non calendaires relève du rapport
 *   /api/banque/resume : depuis B3-C, il les transmet en catégorie C pour
 *   TOUTE période demandée. Le rapport est la surface de détection, l'index
 *   reste un sommaire de navigation.
 */
export function construireIndexBanque(brut: BrutIndexBanque): IndexBanque {
  const dates = brut.datesLignes
    .filter((d) => estDateIsoCalendaire(d))
    .slice()
    .sort();
  const periode: PeriodeBanque | null =
    dates.length > 0 ? { du: dates[0], au: dates[dates.length - 1] } : null;

  const mois = brut.moisEntrees
    .filter((m) => estMoisYm(m))
    .slice()
    .sort();

  const editions: EditionDisponible[] = brut.editions.map((e) => ({
    numero: e.numero as number,
    dateDebut: normaliserDateSql(e.dateDebut),
    dateFin: normaliserDateSql(e.dateFin),
  }));

  return {
    maisons: {
      donnees: brut.nbLignes > 0,
      nbLignes: brut.nbLignes,
      periode, // null si aucune donnée : jamais de période par défaut inventée
    },
    zones: {
      donnees: brut.nbEntrees > 0,
      nbEntrees: brut.nbEntrees,
      mois,
    },
    editions: {
      donnees: editions.length > 0,
      nbEditions: editions.length,
      editions,
    },
  };
}

/** Charge l'index depuis PostgreSQL (5 requêtes SELECT, en parallèle). */
export async function lireIndexBanque(q: RequeteDb): Promise<IndexBanque> {
  const [nbLignes, dates, nbEntrees, mois, editions] = await Promise.all([
    q(SQL_NB_LIGNES),
    q(SQL_DATES_LIGNES),
    q(SQL_NB_ENTREES),
    q(SQL_MOIS_ENTREES),
    q(SQL_INDEX_EDITIONS),
  ]);
  return construireIndexBanque({
    nbLignes: Number(nbLignes.rows[0]?.nb ?? 0),
    datesLignes: dates.rows.map((r) => r.date as string),
    nbEntrees: Number(nbEntrees.rows[0]?.nb ?? 0),
    moisEntrees: mois.rows.map((r) => r.mois as string),
    editions: editions.rows,
  });
}

/** Index + gestion d'erreur : 500 générique, aucun détail interne exposé. */
export async function executerIndex(
  q: RequeteDb
): Promise<ResultatService<IndexBanque>> {
  try {
    return { ok: true, donnees: await lireIndexBanque(q) };
  } catch {
    return { ok: false, status: 500, erreur: ERREUR_SERVICE };
  }
}

// ---- GET /api/banque/resume ----

/**
 * Charge les données bornées par la période, normalise les dates d'éditions
 * à la frontière de chargement (normaliserDateSql) puis applique le moteur
 * pur construireRapportBanque (rapport à 3 sections, sans total général).
 * Ne fait que des SELECT paramétrés ; ne doit être appelé qu'après
 * lirePeriodeDepuisParams (le moteur lèverait une erreur sinon).
 */
export async function lireRapportBanque(
  q: RequeteDb,
  periode: PeriodeBanque
): Promise<RapportBanque> {
  const moisDu = periode.du.slice(0, 7);
  const moisAu = periode.au.slice(0, 7);
  const [lignes, entrees, editions] = await Promise.all([
    q(SQL_LIGNES_PERIODE, [moisDu, moisAu]),
    q(SQL_ENTREES_PERIODE, [moisDu, moisAu]),
    q(SQL_EDITIONS_PERIODE, [periode.du, periode.au]),
  ]);
  return construireRapportBanque(
    {
      lignes: lignes.rows.map(versLigne),
      entrees: entrees.rows.map(versEntreeZone),
      editions: editions.rows.map(versEdition),
    },
    periode
  );
}

/**
 * Validation de période AVANT tout appel base, puis chargement + moteur.
 * 400 sur période absente/invalide ; 500 « Erreur de service. » sur échec DB
 * (le message d'origine reste côté serveur).
 */
export async function executerResume(
  q: RequeteDb,
  params: Pick<URLSearchParams, "get">
): Promise<ResultatService<RapportBanque>> {
  const periode = lirePeriodeDepuisParams(params);
  if (!periode.ok) {
    return { ok: false, status: 400, erreur: periode.erreur };
  }
  try {
    return { ok: true, donnees: await lireRapportBanque(q, periode.periode) };
  } catch {
    return { ok: false, status: 500, erreur: ERREUR_SERVICE };
  }
}
