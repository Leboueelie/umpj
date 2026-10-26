import type { Pool } from "pg";
import { fmtNombre, estDateIsoCalendaire } from "./banque.ts";

/**
 * Moteur des rapports de comptage (mission refonte front + rapports).
 * Lecture seule : chaque rapport agrégé vient des tables métier réelles.
 * Aucun total général n'est calculé entre unités différentes.
 */

export type PeriodeIso = { du: string; au: string };

export type IndicateurRapport = {
  libelle: string;
  valeur: string;
  definition: string;
};

export type AnomalieRapport = {
  libelle: string;
  nombre: number;
};

export type RapportModule = {
  module: string;
  intitule: string;
  source: string;
  periode: PeriodeIso | null;
  volumesExamines: number;
  indicateurs: IndicateurRapport[];
  tableau?: {
    titre: string;
    colonnes: string[];
    lignes: (string | number)[][];
  };
  anomalies: AnomalieRapport[];
  limites: string[];
};

export const MODULES_RAPPORT: Record<string, string> = {
  equipes: "Équipes de prière",
  nuits: "Nuits de prière",
  croisades: "Croisades de jeûne et prière",
  sieges: "Sièges de prière",
  documents: "Documents (jeûne, proclamations, actions de grâce)",
  chambres: "Chambres de prière",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valide une période optionnelle au format ISO (YYYY-MM-DD) et calendairalement
 * valide (ex. "2025-99-99" ou "2025-02-31" refusés, réutilise la validation
 * calendaire de lib/banque.ts). Les deux bornes sont obligatoires ensemble ;
 * du <= au exigé.
 */
export function validerPeriodeIso(
  du: string | null,
  au: string | null
): { ok: true; periode: PeriodeIso | null } | { ok: false; erreur: string } {
  if (!du && !au) return { ok: true, periode: null };
  if (!du || !au) {
    return { ok: false, erreur: "Indiquez les deux bornes (Du et Au) ou aucune." };
  }
  if (!ISO.test(du) || !ISO.test(au) || !estDateIsoCalendaire(du) || !estDateIsoCalendaire(au)) {
    return { ok: false, erreur: "Format de date attendu : AAAA-MM-JJ." };
  }
  if (du > au) {
    return { ok: false, erreur: "La date « Du » doit précéder la date « Au »." };
  }
  return { ok: true, periode: { du, au } };
}

function arrondi1(v: number): string {
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

function minutesVersHeures(m: number): string {
  return `${arrondi1(m / 60)} h`;
}

function octetsVersLisible(o: number): string {
  if (o >= 1024 * 1024) return `${arrondi1(o / (1024 * 1024))} Mo`;
  if (o >= 1024) return `${arrondi1(o / 1024)} Ko`;
  return `${o} o`;
}

async function rapportEquipes(
  pool: Pool,
  periode: PeriodeIso | null
): Promise<RapportModule> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS sessions,
            COALESCE(SUM("nombrePersonnes"), 0)::int AS participants,
            COALESCE(SUM("tempsMis"), 0)::int AS minutes,
            COUNT(*) FILTER (WHERE "dateFin" < "dateDebut")::int AS dates_incoherentes,
            MIN("dateDebut") AS min_d, MAX("dateFin") AS max_d,
            COUNT(*)::int AS examinees
     FROM "EquipePriere"
     WHERE ($1::date IS NULL OR ("dateDebut" <= $2::date AND "dateFin" >= $1::date))`,
    [periode?.du ?? null, periode?.au ?? null]
  );
  const v = r.rows[0];
  const bornes =
    v.min_d && v.max_d ? `Données présentes du ${v.min_d} au ${v.max_d}.` : "Aucune donnée.";
  return {
    module: "equipes",
    intitule: MODULES_RAPPORT["equipes"],
    source: "Table EquipePriere (période = recouvrement avec [dateDebut, dateFin]).",
    periode,
    volumesExamines: v.examinees,
    indicateurs: [
      {
        libelle: "Sessions d'équipes",
        valeur: fmtNombre(v.sessions),
        definition: "Nombre d'enregistrements EquipePriere dans la période.",
      },
      {
        libelle: "Participants cumulés",
        valeur: fmtNombre(v.participants),
        definition:
          "Somme de nombrePersonnes. Un même participant peut apparaître sur plusieurs sessions : ce n'est pas un décompte de personnes uniques.",
      },
      {
        libelle: "Durée cumulée",
        valeur: minutesVersHeures(v.minutes),
        definition: "Somme de tempsMis (minutes converties en heures).",
      },
    ],
    anomalies: [
      {
        libelle: "Sessions dont dateFin précède dateDebut",
        nombre: v.dates_incoherentes,
      },
    ],
    limites: [
      bornes,
      "Le volume (durée × participants) n'est pas agrégé ici : les unités ne sont pas mélangées.",
      "Les sessions sans sujet de prière rattaché ne sont pas distinguées.",
    ],
  };
}

async function rapportNuits(
  pool: Pool,
  periode: PeriodeIso | null
): Promise<RapportModule> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS sessions,
            COALESCE(SUM("participants"), 0)::int AS participants,
            COALESCE(SUM("tempsMis"), 0)::int AS minutes,
            COALESCE(SUM("volume"), 0)::int AS volume,
            COUNT(*) FILTER (WHERE "volume" <> "tempsMis" * "participants")::int AS volumes_incoherents,
            COUNT(*) FILTER (WHERE "heureFin" <= "heureDebut")::int AS heures_incoherentes,
            COUNT(*)::int AS examinees
     FROM "NuitPriere"
     WHERE ($1::date IS NULL OR "date" BETWEEN $1::date AND $2::date)`,
    [periode?.du ?? null, periode?.au ?? null]
  );
  const v = r.rows[0];
  const parCategorie = await pool.query(
    `SELECT COALESCE(NULLIF("nomCategorie", ''), "categorie") AS categorie,
            COUNT(*)::int AS sessions,
            COALESCE(SUM("participants"), 0)::int AS participants,
            COALESCE(SUM("volume"), 0)::int AS volume
     FROM "NuitPriere"
     WHERE ($1::date IS NULL OR "date" BETWEEN $1::date AND $2::date)
     GROUP BY 1 ORDER BY 1`,
    [periode?.du ?? null, periode?.au ?? null]
  );
  return {
    module: "nuits",
    intitule: MODULES_RAPPORT.nuits,
    source: "Table NuitPriere (période = date de la nuit).",
    periode,
    volumesExamines: v.examinees,
    indicateurs: [
      {
        libelle: "Nuits de prière",
        valeur: fmtNombre(v.sessions),
        definition: "Nombre d'enregistrements NuitPriere dans la période.",
      },
      {
        libelle: "Participants cumulés",
        valeur: fmtNombre(v.participants),
        definition: "Somme de participants sur les nuits de la période.",
      },
      {
        libelle: "Durée cumulée",
        valeur: minutesVersHeures(v.minutes),
        definition: "Somme de tempsMis (minutes converties en heures).",
      },
      {
        libelle: "Volume (heure-personnes)",
        valeur: fmtNombre(v.volume),
        definition:
          "Somme du champ volume enregistré (durée × participants par nuit, en heure-personnes).",
      },
    ],
    tableau: {
      titre: "Par catégorie",
      colonnes: ["Catégorie", "Sessions", "Participants", "Volume (h-p)"],
      lignes: parCategorie.rows.map((c) => [
        c.categorie,
        c.sessions,
        c.participants,
        c.volume,
      ]),
    },
    anomalies: [
      {
        libelle: "Nuits dont volume ≠ durée × participants",
        nombre: v.volumes_incoherents,
      },
      { libelle: "Nuits dont heureFin précède heureDebut", nombre: v.heures_incoherentes },
    ],
    limites: [
      "Le volume est celui enregistré en base ; il n'est pas recalculé.",
      "Les catégories « autre » sont regroupées sous leur nom personnalisé.",
    ],
  };
}

async function rapportCroisades(
  pool: Pool,
  periode: PeriodeIso | null
): Promise<RapportModule> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS sessions,
            COALESCE(SUM("effectif"), 0)::int AS effectif,
            COALESCE(SUM("tempsMis"), 0)::int AS minutes,
            COUNT(*) FILTER (WHERE "heureFin" <= "heureDebut")::int AS heures_incoherentes,
            COUNT(*) FILTER (WHERE "effectif" <> ("frereSoeur" + "accueil" + "semeurs" + "secretariat1" + "secretariat2" + "sono" + "ames" + "rtvc"))::int AS effectifs_incoherents,
            COUNT(*)::int AS examinees
     FROM "CroisadeJeunePriere"
     WHERE ($1::date IS NULL OR "date" BETWEEN $1::date AND $2::date)`,
    [periode?.du ?? null, periode?.au ?? null]
  );
  const v = r.rows[0];
  return {
    module: "croisades",
    intitule: MODULES_RAPPORT.croisades,
    source: "Table CroisadeJeunePriere (période = date de la session).",
    periode,
    volumesExamines: v.examinees,
    indicateurs: [
      {
        libelle: "Sessions de croisade",
        valeur: fmtNombre(v.sessions),
        definition: "Nombre d'enregistrements CroisadeJeunePriere dans la période.",
      },
      {
        libelle: "Effectif cumulé",
        valeur: fmtNombre(v.effectif),
        definition: "Somme du champ effectif (somme des rôles enregistrés par session).",
      },
      {
        libelle: "Durée cumulée",
        valeur: minutesVersHeures(v.minutes),
        definition: "Somme de tempsMis (minutes converties en heures).",
      },
    ],
    anomalies: [
      {
        libelle: "Sessions dont effectif ≠ somme des rôles",
        nombre: v.effectifs_incoherents,
      },
      { libelle: "Sessions dont heureFin précède heureDebut", nombre: v.heures_incoherentes },
    ],
    limites: [
      "L'effectif est la somme des rôles enregistrés ; ce n'est pas un décompte de personnes uniques sur la période.",
    ],
  };
}

async function rapportSieges(
  pool: Pool,
  periode: PeriodeIso | null
): Promise<RapportModule> {
  const total = await pool.query(
    `SELECT COUNT(*)::int AS sessions,
            COUNT(DISTINCT "numeroEdition")::int AS editions,
            COALESCE(SUM("participants"), 0)::int AS participants,
            COALESCE(SUM("tempsMis"), 0)::int AS minutes,
            COUNT(*) FILTER (WHERE "heureFin" <= "heureDebut")::int AS heures_incoherentes,
            COUNT(*)::int AS examinees
     FROM "SiegePriere"
     WHERE ($1::date IS NULL OR "date" BETWEEN $1::date AND $2::date)`,
    [periode?.du ?? null, periode?.au ?? null]
  );
  const v = total.rows[0];
  const parEdition = await pool.query(
    `SELECT "numeroEdition"::int AS edition,
            COUNT(*)::int AS sessions,
            COUNT(DISTINCT "jour")::int AS jours,
            COALESCE(SUM("participants"), 0)::int AS participants,
            COALESCE(SUM("tempsMis"), 0)::int AS minutes
     FROM "SiegePriere"
     WHERE ($1::date IS NULL OR "date" BETWEEN $1::date AND $2::date)
     GROUP BY 1 ORDER BY 1 DESC`,
    [periode?.du ?? null, periode?.au ?? null]
  );
  return {
    module: "sieges",
    intitule: MODULES_RAPPORT.sieges,
    source: "Table SiegePriere (période = date de la session).",
    periode,
    volumesExamines: v.examinees,
    indicateurs: [
      {
        libelle: "Sessions de siège",
        valeur: fmtNombre(v.sessions),
        definition: "Nombre d'enregistrements SiegePriere dans la période.",
      },
      {
        libelle: "Éditions distinctes",
        valeur: fmtNombre(v.editions),
        definition: "Nombre de numéros d'édition différents présents.",
      },
      {
        libelle: "Participants cumulés",
        valeur: fmtNombre(v.participants),
        definition: "Somme de participants sur les sessions.",
      },
      {
        libelle: "Durée cumulée",
        valeur: minutesVersHeures(v.minutes),
        definition: "Somme de tempsMis (minutes converties en heures).",
      },
    ],
    tableau: {
      titre: "Par édition",
      colonnes: ["Édition", "Sessions", "Jours", "Participants", "Durée (h)"],
      lignes: parEdition.rows.map((e) => [
        e.edition,
        e.sessions,
        e.jours,
        e.participants,
        arrondi1(e.minutes / 60),
      ]),
    },
    anomalies: [
      {
        libelle: "Sessions dont heureFin précède heureDebut",
        nombre: v.heures_incoherentes,
      },
    ],
    limites: [
      "Les éditions en doublon ne sont pas fusionnées : chaque numéro est tel qu'enregistré.",
    ],
  };
}

async function rapportDocuments(
  pool: Pool,
  periode: PeriodeIso | null
): Promise<RapportModule> {
  const params = [periode?.du ?? null, periode?.au ?? null];
  const jeune = await pool.query(
    `SELECT COALESCE(NULLIF("categorie", ''), '(sans catégorie)') AS categorie,
            COUNT(*)::int AS fichiers, COALESCE(SUM("taille"), 0)::int AS octets
     FROM "Jeune"
     WHERE ($1::date IS NULL OR "createdAt"::date BETWEEN $1::date AND $2::date)
     GROUP BY 1 ORDER BY 1`,
    params
  );
  const proclamation = await pool.query(
    `SELECT COALESCE(NULLIF("type", ''), '(sans type)') AS categorie,
            COUNT(*)::int AS fichiers, COALESCE(SUM("taille"), 0)::int AS octets
     FROM "Proclamation"
     WHERE ($1::date IS NULL OR "createdAt"::date BETWEEN $1::date AND $2::date)
     GROUP BY 1 ORDER BY 1`,
    params
  );
  const ag = await pool.query(
    `SELECT COALESCE(NULLIF("type", ''), '(sans type)') AS categorie,
            COUNT(*)::int AS fichiers, COALESCE(SUM("taille"), 0)::int AS octets
     FROM "ActionDeGrace"
     WHERE ($1::date IS NULL OR "createdAt"::date BETWEEN $1::date AND $2::date)
     GROUP BY 1 ORDER BY 1`,
    params
  );
  const total = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM "Jeune") + (SELECT COUNT(*)::int FROM "Proclamation")
       + (SELECT COUNT(*)::int FROM "ActionDeGrace") AS fichiers,
       (SELECT COALESCE(SUM("taille"), 0)::int FROM "Jeune")
       + (SELECT COALESCE(SUM("taille"), 0)::int FROM "Proclamation")
       + (SELECT COALESCE(SUM("taille"), 0)::int FROM "ActionDeGrace") AS octets`,
    []
  );
  const lignes: (string | number)[][] = [
    ...jeune.rows.map((j) => ["Jeûne", j.categorie, j.fichiers, octetsVersLisible(j.octets)]),
    ...proclamation.rows.map((p) => [
      "Proclamation",
      p.categorie,
      p.fichiers,
      octetsVersLisible(p.octets),
    ]),
    ...ag.rows.map((a) => [
      "Actions de grâce",
      a.categorie,
      a.fichiers,
      octetsVersLisible(a.octets),
    ]),
  ];
  return {
    module: "documents",
    intitule: MODULES_RAPPORT.documents,
    source:
      "Tables Jeune, Proclamation, ActionDeGrace (période = date d'import createdAt).",
    periode,
    volumesExamines: total.rows[0].fichiers,
    indicateurs: [
      {
        libelle: "Fichiers enregistrés (toutes sources)",
        valeur: fmtNombre(total.rows[0].fichiers),
        definition: "Somme des fichiers des trois tables de documents.",
      },
      {
        libelle: "Taille cumulée",
        valeur: octetsVersLisible(total.rows[0].octets),
        definition: "Somme des tailles en octets, convertie en unité lisible.",
      },
    ],
    tableau: {
      titre: "Par module et catégorie",
      colonnes: ["Module", "Catégorie / type", "Fichiers", "Taille"],
      lignes,
    },
    anomalies: [],
    limites: [
      "La période filtre sur la date d'import (createdAt), pas sur la date du document.",
      "Le contenu des fichiers n'est pas examiné : seules les métadonnées (nom, taille) sont agrégées.",
      "Un rapport sans période porte sur la totalité des fichiers présents.",
    ],
  };
}

async function rapportChambres(pool: Pool): Promise<RapportModule> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "actif")::int AS actives,
            COUNT(*) FILTER (WHERE NOT "actif")::int AS inactives
     FROM "ChambreDePriere"`,
    []
  );
  const v = r.rows[0];
  const parZone = await pool.query(
    `SELECT z.nom AS zone,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c."actif")::int AS actives
     FROM "ChambreDePriere" c
     LEFT JOIN "Zone" z ON z.id = c."zoneId"
     GROUP BY 1 ORDER BY 1`,
    []
  );
  const orphelines = v.total - parZone.rows.reduce((s, z) => s + z.total, 0);
  return {
    module: "chambres",
    intitule: MODULES_RAPPORT.chambres,
    source: "Tables ChambreDePriere et Zone.",
    periode: null,
    volumesExamines: v.total,
    indicateurs: [
      {
        libelle: "Chambres enregistrées",
        valeur: fmtNombre(v.total),
        definition: "Nombre total d'enregistrements ChambreDePriere.",
      },
      {
        libelle: "Chambres actives",
        valeur: fmtNombre(v.actives),
        definition: "Enregistrements avec actif = vrai.",
      },
      {
        libelle: "Chambres inactives",
        valeur: fmtNombre(v.inactives),
        definition: "Enregistrements avec actif = faux.",
      },
    ],
    tableau: {
      titre: "Par zone",
      colonnes: ["Zone", "Total", "Actives"],
      lignes: parZone.rows.map((z) => [z.zone ?? "(sans zone)", z.total, z.actives]),
    },
    anomalies: [{ libelle: "Chambres sans zone rattachée", nombre: Math.max(0, orphelines) }],
    limites: [
      "Aucune date n'est suivie par chambre : aucun filtre de période n'est possible.",
      "Les champs lieu, fardeau, dirigeants et contacts ne sont pas agrégés (données libres).",
    ],
  };
}

const FONCTIONS: Record<
  string,
  (pool: Pool, periode: PeriodeIso | null) => Promise<RapportModule>
> = {
  equipes: rapportEquipes,
  nuits: rapportNuits,
  croisades: rapportCroisades,
  sieges: rapportSieges,
  documents: rapportDocuments,
  chambres: async (pool) => rapportChambres(pool),
};

export async function construireRapport(
  pool: Pool,
  module: string,
  du: string | null,
  au: string | null
): Promise<RapportModule | null> {
  const fn = FONCTIONS[module];
  if (!fn) return null;
  const validation = validerPeriodeIso(du, au);
  if (!validation.ok) throw new Error(validation.erreur);
  if (module === "chambres" && validation.periode) {
    throw new Error("Le rapport des chambres ne prend pas de période (aucune date par chambre).");
  }
  const rapport = await fn(pool, validation.periode);
  if (module === "chambres") {
    return { ...rapport, intitule: MODULES_RAPPORT.chambres };
  }
  return rapport;
}
