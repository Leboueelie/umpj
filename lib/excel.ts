import type { Cahier, Ligne } from "@/lib/types";
import { toMin, tempsMisMin, cumulMin, fmtDate } from "@/lib/calc";

const TIME_FMT = "hh:mm";
const DUREE_FMT = "[h]\\hmm";

// Construit la feuille d'un cahier avec formules Excel editables
async function buildCahierSheet(c: Cahier, allLignes: Ligne[]) {
  const XLSX = await import("xlsx");
  const ls = allLignes
    .filter((l) => l.cahierId === c.id)
    .slice()
    .sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));

  const aoa: unknown[][] = [["N°", "Date", "Début", "Fin", "Participant(s)", "Temps mis", "Cumul"]];
  let total = 0;

  ls.forEach((l, i) => {
    const r = i + 2; // rangée Excel (1 = en-tête)
    const tm = tempsMisMin(l.heureDebut, l.heureFin);
    const cu = cumulMin(tm, l.nombrePersonnes);
    total += cu || 0;
    const debutS = (toMin(l.heureDebut) || 0) / 1440;
    const finS = (toMin(l.heureFin) || 0) / 1440;
    const tmS = (tm || 0) / 1440;
    const cuS = (cu || 0) / 1440;
    aoa.push([
      i + 1,
      fmtDate(l.date),
      { t: "n", v: debutS, z: TIME_FMT },
      { t: "n", v: finS, z: TIME_FMT },
      l.nombrePersonnes,
      { t: "n", v: tmS, z: DUREE_FMT, f: "=IF(D" + r + "<C" + r + ",D" + r + "-C" + r + "+1,D" + r + "-C" + r + ")" },
      { t: "n", v: cuS, z: DUREE_FMT, f: "=F" + r + "*E" + r },
    ]);
  });

  const last = ls.length + 1; // dernière rangée de données
  aoa.push([
    "Complet",
    "",
    "",
    "",
    "",
    "",
    { t: "n", v: total / 1440, z: DUREE_FMT, f: "=SUM(G2:G" + last + ")" },
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Lecture facilitée (lib xlsx CE) : largeurs + auto-filtre
  const w: any = ws;
  w["!cols"] = [
    { wch: 5 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 11 }, { wch: 11 },
  ];
  w["!autofilter"] = { ref: "A1:G" + (ls.length + 1) };

  return { XLSX, ws, sheetName: c.nom.slice(0, 28), totalRow: ls.length + 2 };
}

export async function exportCahier(c: Cahier, lignes: Ligne[]) {
  const { XLSX, ws, sheetName } = await buildCahierSheet(c, lignes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  wb.Workbook = (wb.Workbook || {}) as any;
  (wb.Workbook as any).CalcPr = { fullCalcOnLoad: true };
  XLSX.writeFile(wb, (c.nom || "cahier") + ".xlsx");
}

export async function exportGlobal(cahiers: Cahier[], lignes: Ligne[]) {
  const first = await buildCahierSheet(cahiers[0] || { id: "", nom: "" }, lignes);
  const { XLSX } = first;
  const wb = XLSX.utils.book_new();
  wb.Workbook = (wb.Workbook || {}) as any;
  (wb.Workbook as any).CalcPr = { fullCalcOnLoad: true };
  const recap: unknown[][] = [["Cahier", "Complet"]];

  for (const c of cahiers) {
    const { ws, sheetName, totalRow } = await buildCahierSheet(c, lignes);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const safe = "'" + sheetName.replace(/'/g, "''") + "'";
    const total = lignes
      .filter((l) => l.cahierId === c.id)
      .reduce((acc, l) => {
        const cu = cumulMin(tempsMisMin(l.heureDebut, l.heureFin), l.nombrePersonnes);
        return acc + (cu || 0);
      }, 0);
    recap.push([
      c.nom,
      { t: "n", v: total / 1440, z: DUREE_FMT, f: "=" + safe + "!G" + totalRow },
    ]);
  }

  const recapWs: any = XLSX.utils.aoa_to_sheet(recap as any);
  recapWs["!cols"] = [{ wch: 30 }, { wch: 12 }];
  recapWs["!autofilter"] = { ref: "A1:B" + (cahiers.length + 1) };
  XLSX.utils.book_append_sheet(wb, recapWs, "Récapitulatif");
  XLSX.writeFile(wb, "registres-priere.xlsx");
}

// ---- Import (contrepartie de l'export) ----

function parseTime(cell: any): string {
  if (cell == null || cell === "") return "";
  if (typeof cell === "number") {
    let totalMin = Math.round(cell * 1440);
    if (totalMin < 0) totalMin = 0;
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  const s = String(cell).trim();
  let m = s.match(/(\d{1,2})h(\d{2})/);
  if (m) return String(+m[1]).padStart(2, "0") + ":" + m[2];
  m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return String(+m[1]).padStart(2, "0") + ":" + m[2];
  return "";
}

function parseDate(cell: any): string {
  if (cell == null || cell === "") return "";
  if (typeof cell === "number" && cell > 1) {
    const dt = new Date((cell - 25569) * 86400000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
  }
  const s = String(cell).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export interface ImportedCahier {
  nom: string;
  lignes: { date: string; heureDebut: string; heureFin: string; nombrePersonnes: number }[];
}

export async function parseImportFile(file: File): Promise<ImportedCahier[]> {
  const XLSX = await import("xlsx");
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });

  const out: ImportedCahier[] = [];
  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase() === "récapitulatif") continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as any[][];
    if (rows.length < 2) continue;

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const r = rows[i].map((c) => String(c).toLowerCase());
      if (r.includes("date") && (r.includes("début") || r.includes("debut"))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) continue;

    const header = rows[headerIdx].map((c) => String(c).toLowerCase());
    const ciDate = header.findIndex((h) => h.includes("date"));
    const ciDeb = header.findIndex((h) => h.includes("début") || h.includes("debut"));
    const ciFin = header.findIndex((h) => h.includes("fin"));
    let ciParticipant = header.findIndex((h) =>
      /particip|personne|effectif|membre|nombre|fid|^nb$/.test(h)
    );
    if (ciDate < 0 || ciDeb < 0 || ciFin < 0) continue;
    // repli : position canonique Participant(s) dans notre export (N°,Date,Début,Fin,...)
    if (ciParticipant < 0 && header.length >= 5 && ciDate === 1 && ciDeb === 2 && ciFin === 3) {
      ciParticipant = 4;
    }

    const lignes: ImportedCahier["lignes"] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const debut = parseTime(row[ciDeb]);
      if (!debut) continue; // saute la ligne "Complet" et les vides
      const date = parseDate(row[ciDate]);
      const fin = parseTime(row[ciFin]);
      const nb = parseInt(String(row[ciParticipant] ?? "1"), 10) || 1;
      if (!date || !fin) continue;
      lignes.push({ date, heureDebut: debut, heureFin: fin, nombrePersonnes: nb });
    }
    if (lignes.length) out.push({ nom: sheetName, lignes });
  }
  return out;
}
