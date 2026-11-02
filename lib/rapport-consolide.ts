import { pool } from "@/lib/db";
import { construireRapport } from "@/lib/rapports";
import { executerResume, type RequeteDb } from "@/lib/banque-api";
import { indicateursMaisons, indicateursZones, indicateursEditions } from "@/components/banque/logique-banque";
import { estDateIsoCalendaire } from "@/lib/banque";
import type { RapportBanque } from "@/lib/banque";

/**
 * P2 — Rapport institutionnel consolidé (lecture seule).
 *
 * Réutilise les moteurs existants (lib/rapports + lib/banque) sans les
 * modifier : aucune règle de calcul n'est dupliquée. Les grandeurs de
 * sources différentes ne sont jamais additionnées dans un total global.
 */

export const MODULES_CONSOLides = [
  { id: "maisons", label: "Maisons de prière", groupe: "Banque", type: "activite" as const },
  { id: "zones", label: "Zones", groupe: "Banque", type: "activite" as const },
  { id: "editions", label: "Éditions", groupe: "Banque", type: "statistiques" as const },
  { id: "chambres", label: "Chambres de prière", groupe: "Modules", type: "inventaire" as const },
  { id: "equipes", label: "Équipes de prière", groupe: "Modules", type: "activite" as const },
  { id: "nuits", label: "Nuits de prière", groupe: "Modules", type: "activite" as const },
  { id: "croisades", label: "Croisades", groupe: "Modules", type: "activite" as const },
  { id: "sieges", label: "Sièges de prière", groupe: "Modules", type: "activite" as const },
  { id: "documents", label: "Documents (jeûne, proclamations, actions de grâce)", groupe: "Modules", type: "documents" as const },
];

export const MODULES_CONSOLIDES_IDS = MODULES_CONSOLides.map((m) => m.id);

export type TypeRapportConsolide = "statistiques" | "activite" | "inventaire" | "documents";

export type SectionConsolidee = {
  module: string;
  intitule: string;
  source: string;
  periode: { du: string; au: string } | null;
  type: TypeRapportConsolide;
  volumesExamines: number;
  indicateurs: { libelle: string; valeur: string; definition: string }[];
  tableau?: { titre: string; colonnes: string[]; lignes: (string | number)[][] };
  anomalies: { libelle: string; nombre: number }[];
  limites: string[];
  sansDonnees: boolean;
};

export type RapportConsolide = {
  titre: string;
  modules: string[];
  periode: { du: string; au: string } | null;
  dateGeneration: string;
  auteur: string;
  sections: SectionConsolidee[];
  synthese: { module: string; intitule: string; volume: number; resume: string }[];
};

function toIndicateurRapport(i: { label: string; valeur: string; definition?: string }) {
  return { libelle: i.label, valeur: i.valeur, definition: i.definition || i.label };
}

function banqueAnomaliesToRapport(anomalies: { libelle: string; nombre: number }[]) {
  return anomalies;
}

const PERIODE_LARGE: { du: string; au: string } = { du: "1900-01-01", au: "2100-12-31" };

function normaliserPeriode(du: string | null, au: string | null): { du: string; au: string } | null {
  if (du && au) return { du, au };
  return null;
}

/**
 * Construit le rapport consolidé. Lecture seule. Ne modifie aucune donnée.
 * Les grandeurs de sources différentes ne sont jamais additionnées.
 */
export async function construireRapportConsolide(
  pool: any,
  modules: string[],
  du: string | null,
  au: string | null,
  auteur: string
): Promise<RapportConsolide> {
  const periode = normaliserPeriode(du, au);
  // Période effective pour les moteurs (large si absente).
  const periodeEffective: { du: string; au: string } = periode ?? PERIODE_LARGE;

  const sections: SectionConsolidee[] = [];
  const synthese: RapportConsolide["synthese"] = [];

  const meta = (id: string) => MODULES_CONSOLides.find((m) => m.id === id)!;

  // Banque : charger une seule fois si au moins une source banque est sélectionnée.
  const banqueModules = modules.filter((m) => ["maisons", "zones", "editions"].includes(m));
  let banque: RapportBanque | null = null;
  if (banqueModules.length > 0) {
    const requete: RequeteDb = (texte: string, params?: readonly unknown[]) =>
      params === undefined ? pool.query(texte) : pool.query(texte, params as unknown[]);
    const rep = await executerResume(requete, {
      get: (k: string) => (k === "du" ? periodeEffective.du : k === "au" ? periodeEffective.au : null),
    });
    if (rep.ok) banque = rep.donnees;
  }

  // Banque → sections
  if (banque && banqueModules.includes("maisons")) {
    const a = banque.maisons.agregat;
    const ind = indicateursMaisons(a);
    const anomalies: { libelle: string; nombre: number }[] = [];
    const a1 = banque.maisons.anomaliesDisponibles.length;
    const a2 = banque.maisons.anomaliesPeriode.length;
    const a3 = banque.maisons.nonEvaluables.length;
    if (a1 > 0) anomalies.push({ libelle: "Anomalies disponibles (cat. A)", nombre: a1 });
    if (a2 > 0) anomalies.push({ libelle: "Anomalies sur la période (cat. B)", nombre: a2 });
    if (a3 > 0) anomalies.push({ libelle: "Lignes non évaluables (cat. C)", nombre: a3 });
    const sec: SectionConsolidee = {
      module: "maisons",
      intitule: "Maisons de prière",
      source: "Tables Cahier et Ligne (période = dates des lignes).",
      periode,
      type: "activite",
      volumesExamines: banque.maisons.nbTotal,
      indicateurs: ind.map(toIndicateurRapport),
      anomalies,
      limites: [
        "Cumul null si aucune donnée calculable.",
        "Période = dates des lignes de cahier.",
      ],
      sansDonnees: banque.maisons.nbTotal === 0,
    };
    sections.push(sec);
    synthese.push({
      module: "maisons",
      intitule: "Maisons de prière",
      volume: banque.maisons.nbTotal,
      resume: ind.map((i) => `${i.label} : ${i.valeur}`).join(" · "),
    });
  }

  if (banque && banqueModules.includes("zones")) {
    const a = banque.zones.agregat;
    const ind = indicateursZones(a);
    const anomalies: { libelle: string; nombre: number }[] = [];
    if (banque.zones.anomaliesDisponibles.length > 0)
      anomalies.push({ libelle: "Anomalies disponibles (cat. A)", nombre: banque.zones.anomaliesDisponibles.length });
    if (banque.zones.anomaliesPeriode.length > 0)
      anomalies.push({ libelle: "Anomalies sur la période (cat. B)", nombre: banque.zones.anomaliesPeriode.length });
    if (banque.zones.nonEvaluables.length > 0)
      anomalies.push({ libelle: "Lignes non évaluables (cat. C)", nombre: banque.zones.nonEvaluables.length });
    const sec: SectionConsolidee = {
      module: "zones",
      intitule: "Zones",
      source: "Tables Zone et EntreeZone (période = mois des entrées).",
      periode,
      type: "activite",
      volumesExamines: banque.zones.nbTotal,
      indicateurs: ind.map(toIndicateurRapport),
      anomalies,
      limites: [
        "tempsMis peut être NULL (signalé, non compté).",
        "Cumul null si aucune donnée calculable.",
      ],
      sansDonnees: banque.zones.nbTotal === 0,
    };
    sections.push(sec);
    synthese.push({
      module: "zones",
      intitule: "Zones",
      volume: banque.zones.nbTotal,
      resume: ind.map((i) => `${i.label} : ${i.valeur}`).join(" · "),
    });
  }

  if (banque && banqueModules.includes("editions")) {
    const a = banque.editions.agregat;
    const ind = indicateursEditions(a);
    const anomalies: { libelle: string; nombre: number }[] = [];
    if (banque.editions.anomaliesDisponibles.length > 0)
      anomalies.push({ libelle: "Anomalies disponibles (cat. A)", nombre: banque.editions.anomaliesDisponibles.length });
    if (banque.editions.anomaliesPeriode.length > 0)
      anomalies.push({ libelle: "Anomalies sur la période (cat. B)", nombre: banque.editions.anomaliesPeriode.length });
    if (banque.editions.nonEvaluables.length > 0)
      anomalies.push({ libelle: "Lignes non évaluables (cat. C)", nombre: banque.editions.nonEvaluables.length });
    const sec: SectionConsolidee = {
      module: "editions",
      intitule: "Éditions",
      source: "Table Edition (période = dateDebut/dateFin de l'édition).",
      periode,
      type: "statistiques",
      volumesExamines: banque.editions.nbTotal,
      indicateurs: ind.map(toIndicateurRapport),
      anomalies,
      limites: [
        "Moyenne de participation = valeur enregistrée (jamais recalculée).",
        "Pas de décompte de personnes uniques.",
      ],
      sansDonnees: banque.editions.nbTotal === 0,
    };
    sections.push(sec);
    synthese.push({
      module: "editions",
      intitule: "Éditions",
      volume: banque.editions.nbTotal,
      resume: ind.map((i) => `${i.label} : ${i.valeur}`).join(" · "),
    });
  }

  // Modules lib/rapports
  const modulesRapports = modules.filter((m) =>
    ["chambres", "equipes", "nuits", "croisades", "sieges", "documents"].includes(m)
  );
  for (const mod of modulesRapports) {
    // chambres ne prend pas de période
    const p = mod === "chambres" ? null : periode;
    const rapport = await construireRapport(pool, mod, p?.du ?? null, p?.au ?? null);
    if (!rapport) continue;
    const meta = MODULES_CONSOLides.find((m) => m.id === mod)!;
    const section: SectionConsolidee = {
      module: mod,
      intitule: rapport.intitule,
      source: rapport.source,
      periode: rapport.periode,
      type: meta.type,
      volumesExamines: rapport.volumesExamines,
      indicateurs: rapport.indicateurs.map((i) => ({ libelle: i.libelle, valeur: i.valeur, definition: i.definition })),
      tableau: rapport.tableau,
      anomalies: rapport.anomalies.map((a) => ({ libelle: a.libelle, nombre: a.nombre })),
      limites: rapport.limites,
      sansDonnees: rapport.volumesExamines === 0,
    };
    sections.push(section);
    synthese.push({
      module: mod,
      intitule: rapport.intitule,
      volume: rapport.volumesExamines,
      resume: rapport.indicateurs.slice(0, 3).map((i) => `${i.libelle} : ${i.valeur}`).join(" · "),
    });
  }

  // Ordre stable : selon l'ordre de MODULES_CONSOLides
  const ordre = MODULES_CONSOLides.map((m) => m.id);
  sections.sort((a, b) => ordre.indexOf(a.module) - ordre.indexOf(b.module));
  synthese.sort((a, b) => ordre.indexOf(a.module) - ordre.indexOf(b.module));

  return {
    titre: "Rapport institutionnel consolidé",
    modules,
    periode,
    dateGeneration: new Date().toISOString(),
    auteur,
    sections,
    synthese,
  };
}

export function validerModulesConsolides(modules: string[]): { ok: true } | { ok: false; erreur: string } {
  if (!Array.isArray(modules) || modules.length === 0) {
    return { ok: false, erreur: "Sélectionnez au moins un module." };
  }
  const inconnus = modules.filter((m) => !MODULES_CONSOLIDES_IDS.includes(m));
  if (inconnus.length > 0) {
    return { ok: false, erreur: `Module inconnu : ${inconnus.join(", ")}.` };
  }
  return { ok: true };
}

export function parseConsolideParams(searchParams: { get: (k: string) => string | null }): {
  ok: true;
  modules: string[];
  du: string | null;
  au: string | null;
  periode: { du: string; au: string } | null;
} | { ok: false; erreur: string; status: number } {
  const rawModules = searchParams.get("modules");
  const modules = rawModules ? rawModules.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const v = validerModulesConsolides(modules);
  if (!v.ok) return { ok: false, erreur: v.erreur, status: 400 };

  const du = searchParams.get("du");
  const au = searchParams.get("au");
  // Période optionnelle : si l'une est fournie, l'autre doit l'être aussi.
  if ((du && !au) || (!du && au)) {
    return { ok: false, erreur: "Indiquez les deux bornes (Du et Au) ou aucune.", status: 400 };
  }
  if (du && au) {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO.test(du) || !ISO.test(au)) {
      return { ok: false, erreur: "Format de date attendu : AAAA-MM-JJ.", status: 400 };
    }
    if (!estDateIsoCalendaire(du) || !estDateIsoCalendaire(au)) {
      return { ok: false, erreur: "Date invalide.", status: 400 };
    }
    if (du > au) {
      return { ok: false, erreur: "La date « Du » doit précéder la date « Au ».", status: 400 };
    }
  }
  const periode = du && au ? { du, au } : null;
  return { ok: true, modules, du, au, periode };
}
