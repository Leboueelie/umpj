import type { Ligne } from "@/lib/types";

// ---- Helpers de calcul (identiques au prototype validé) ----

export function toMin(hhmm: string | null | undefined): number | null {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// RG1: temps mis en minutes, +1440 si négatif (passage minuit)
export function tempsMisMin(debut: string, fin: string): number | null {
  const d = toMin(debut);
  const f = toMin(fin);
  if (d === null || f === null) return null;
  let diff = f - d;
  if (diff < 0) diff += 1440;
  return diff;
}

// RG2: cumul = temps mis * personnes
export function cumulMin(tempsMis: number | null, personnes: number | null | undefined): number | null {
  if (tempsMis === null || !personnes) return null;
  return tempsMis * personnes;
}

// Affichage Xh YYmn
export function fmtDuree(min: number | null | undefined): string {
  if (min === null || min === undefined) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + "h" + String(m).padStart(2, "0");
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return d + "/" + m + "/" + y;
}

// RG3: complet d'un cahier = somme des cumuls
export function completCahier(lignes: Ligne[]): number {
  let total = 0;
  for (const l of lignes) {
    const tm = tempsMisMin(l.heureDebut, l.heureFin);
    const cu = cumulMin(tm, l.nombrePersonnes);
    if (cu !== null) total += cu;
  }
  return total;
}
