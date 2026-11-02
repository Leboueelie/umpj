import type { RapportConsolide } from "./rapport-consolide";

// Note : la version communautaire de SheetJS (xlsx) ne conserve pas les
// styles (gras, couleurs, bordures) à l'écriture. La différenciation se fait
// donc par la structure (titres, en-têtes en majuscules, séparateurs) et les
// largeurs de colonnes. Les formats numériques (z) et les volets figés sont
// pris en charge.

const DUREE_FMT = "[h]\\hmm";

function safeSheetName(name: string, used: Set<string>): string {
  // Excel : max 31 caractères, pas de []:*?/\\
  let s = name.replace(/[\[\]:*?/\\]/g, "").trim();
  if (s.length > 31) s = s.slice(0, 31);
  if (!s) s = "Feuille";
  // unicité
  let base = s;
  let i = 2;
  while (used.has(s)) {
    const suffix = ` (${i})`;
    s = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(s);
  return s;
}

function aoa(rows: unknown[][]): unknown[][] {
  return rows;
}

function titreBloc(titre: string): unknown[][] {
  return [[titre], [""]];
}

export function buildConsolidatedXlsxBuffer(rapport: RapportConsolide, auteur: string): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx");

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  // ---- Feuille 1 : Synthèse ----
  const synthRows: unknown[][] = [];
  synthRows.push(["RAPPORT INSTITUTIONNEL CONSOLIDÉ — UMPJ"]);
  synthRows.push([""]);
  synthRows.push(["Identité", "UMPJ — Université Mondiale de la Prière et du Jeûne"]);
  synthRows.push(["Titre", rapport.titre]);
  synthRows.push(["Période", rapport.periode ? `${rapport.periode.du} au ${rapport.periode.au}` : "Inventaire (toutes les données disponibles)"]);
  synthRows.push(["Modules sélectionnés", rapport.modules.join(", ")]);
  synthRows.push(["Date et heure de génération", rapport.dateGeneration.replace("T", " ").slice(0, 19)]);
  synthRows.push(["Auteur", auteur]);
  synthRows.push([""]);
  synthRows.push(["INDICATEURS PRINCIPAUX PAR MODULE"]);
  synthRows.push(["Module", "Volume examiné", "Indicateurs clés"]);
  for (const s of rapport.synthese) {
    synthRows.push([s.intitule, s.volume, s.resume || "—"]);
  }
  synthRows.push([""]);
  synthRows.push(["ANOMALIES RECENTES"]);
  const allAnom = rapport.sections.flatMap((s) => s.anomalies.map((a) => ({ module: s.intitule, ...a })));
  if (allAnom.length === 0) {
    synthRows.push(["Aucune anomalie détectée."]);
  } else {
    synthRows.push(["Module", "Anomalie", "Nombre"]);
    for (const a of allAnom) synthRows.push([a.module, a.libelle, a.nombre]);
  }
  synthRows.push([""]);
  synthRows.push(["LIMITES"]);
  const allLim = Array.from(new Set(rapport.sections.flatMap((s) => s.limites)));
  if (allLim.length === 0) {
    synthRows.push(["Aucune limite signalée."]);
  } else {
    for (const l of allLim) synthRows.push([l]);
  }
  synthRows.push([""]);
  synthRows.push(["REMISE : aucun total général inter-modules (unités non additionnables). Les participants sont des cumuls, pas des personnes uniques."]);

  const wsSynth = XLSX.utils.aoa_to_sheet(synthRows);
  wsSynth["!cols"] = [{ wch: 34 }, { wch: 22 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsSynth, safeSheetName("Synthèse", usedNames));

  // ---- Feuille 2 : Méthodologie ----
  const methRows: unknown[][] = [];
  methRows.push(["MÉTHODOLOGIE ET SOURCES"]);
  methRows.push([""]);
  methRows.push(["Modules sélectionnés", rapport.modules.join(", ")]);
  methRows.push(["Période", rapport.periode ? `${rapport.periode.du} au ${rapport.periode.au}` : "Toutes les données disponibles (inventaire)"]);
  methRows.push(["Date de génération", rapport.dateGeneration.replace("T", " ").slice(0, 19)]);
  methRows.push(["Auteur", auteur]);
  methRows.push([""]);
  methRows.push(["SOURCES DE DONNÉES"]);
  for (const s of rapport.sections) {
    methRows.push([s.intitule, s.source]);
  }
  methRows.push([""]);
  methRows.push(["DÉFINITIONS DES INDICATEURS"]);
  methRows.push(["Indicateur", "Définition"]);
  const defs = new Set<string>();
  for (const s of rapport.sections) {
    for (const i of s.indicateurs) {
      const key = `${i.libelle}||${i.definition}`;
      if (!defs.has(key)) {
        defs.add(key);
        methRows.push([i.libelle, i.definition]);
      }
    }
  }
  methRows.push([""]);
  methRows.push(["RÈGLES DE CALCUL IMPORTANTES"]);
  methRows.push(["- Les participants sont des cumuls : un même participant peut apparaître sur plusieurs sessions ou jours. Ce n'est pas un décompte de personnes uniques."]);
  methRows.push(["- La moyenne de participation des éditions est la valeur enregistrée (jamais recalculée)."]);
  methRows.push(["- Les durées ne comptent que les sessions dont la durée est valide (durée > 0). Les durées manquantes sont signalées."]);
  methRows.push(["- Les cumuls (heures-personnes) sont null si aucune donnée calculable."]);
  methRows.push(["- Aucun total général n'est calculé entre modules (unités non additionnables)."]);
  methRows.push(["- Les éditions en doublon (même numéro) ne sont pas fusionnées."]);
  methRows.push([""]);
  methRows.push(["LIMITES CONNUE"]);
  for (const l of Array.from(new Set(rapport.sections.flatMap((s) => s.limites)))) {
    methRows.push([l]);
  }
  if (rapport.sections.flatMap((s) => s.limites).length === 0) {
    methRows.push(["Aucune limite signalée."]);
  }
  methRows.push([""]);
  methRows.push(["FILTRES APPLIQUÉS"]);
  methRows.push(["Période", rapport.periode ? `${rapport.periode.du} au ${rapport.periode.au}` : "Aucune (toutes les données)"]);
  methRows.push(["Modules", rapport.modules.join(", ")]);
  const wsMeth = XLSX.utils.aoa_to_sheet(methRows);
  wsMeth["!cols"] = [{ wch: 46 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, wsMeth, safeSheetName("Méthodologie", usedNames));

  // ---- Une feuille par module ----
  for (const sec of rapport.sections) {
    const rows: unknown[][] = [];
    rows.push([sec.intitule.toUpperCase()]);
    rows.push([""]);
    rows.push(["Source", sec.source]);
    rows.push(["Période", sec.periode ? `${sec.periode.du} au ${sec.periode.au}` : "Inventaire sans période"]);
    rows.push(["Volume examiné", sec.volumesExamines]);
    rows.push(["Type", sec.type]);
    rows.push([""]);
    rows.push(["INDICATEURS"]);
    rows.push(["Indicateur", "Valeur", "Définition"]);
    for (const i of sec.indicateurs) {
      rows.push([i.libelle, i.valeur, i.definition]);
    }
    if (sec.tableau) {
      rows.push([""]);
      rows.push([sec.tableau.titre.toUpperCase()]);
      rows.push(sec.tableau.colonnes);
      for (const ligne of sec.tableau.lignes) rows.push(ligne);
    }
    if (sec.anomalies.length > 0) {
      rows.push([""]);
      rows.push(["ANOMALIES"]);
      rows.push(["Anomalie", "Nombre"]);
      for (const a of sec.anomalies) rows.push([a.libelle, a.nombre]);
    } else {
      rows.push([""]);
      rows.push(["Aucune anomalie détectée."]);
    }
    if (sec.limites.length > 0) {
      rows.push([""]);
      rows.push(["LIMITES"]);
      for (const l of sec.limites) rows.push([l]);
    }
    if (sec.sansDonnees) {
      rows.push([""]);
      rows.push(["Aucune donnée pour cette sélection."]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Largeurs : première colonne large, autres adaptées
    const ncols = Math.max(...rows.map((r) => r.length));
    const widths = new Array(ncols).fill(0).map((_, idx) => {
      let max = 12;
      for (const r of rows) {
        const cell = r[idx];
        const len = cell == null ? 0 : String(cell).length;
        if (len > max) max = Math.min(len, 48);
      }
      return { wch: max + 2 };
    });
    ws["!cols"] = widths;
    // Filtre automatique sur la plage du tableau détaillé si présent
    if (sec.tableau) {
      let headerRow = -1;
      for (let i = 0; i < rows.length; i++) {
        if (Array.isArray(rows[i]) && rows[i].length === sec.tableau.colonnes.length &&
            rows[i].every((c, j) => String(c) === String(sec.tableau!.colonnes[j]))) {
          headerRow = i;
          break;
        }
      }
      if (headerRow >= 0) {
        const lastDataRow = headerRow + sec.tableau.lignes.length;
        const lastCol = String.fromCharCode(64 + sec.tableau.colonnes.length);
        ws["!autofilter"] = { ref: `A${headerRow + 1}:${lastCol}${lastDataRow + 1}` };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sec.intitule, usedNames));
  }

  // ---- Dernière feuille : Anomalies ----
  const anomRows: unknown[][] = [];
  anomRows.push(["ANOMALIES DÉTECTÉES"]);
  anomRows.push([""]);
  if (allAnom.length === 0) {
    anomRows.push(["Aucune anomalie détectée."]);
  } else {
    anomRows.push(["Module", "Anomalie", "Nombre", "Catégorie"]);
    for (const a of allAnom) {
      anomRows.push([a.module, a.libelle, a.nombre, ""]);
    }
  }
  anomRows.push([""]);
  anomRows.push(["LIMITE : les anomalies de catégorie C (lignes non évaluables) sont incluses dans le décompte par module."]);
  const wsAnom = XLSX.utils.aoa_to_sheet(anomRows);
  wsAnom["!cols"] = [{ wch: 28 }, { wch: 52 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsAnom, safeSheetName("Anomalies", usedNames));

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
