import type { Ligne } from "@/lib/types";

// ---- Helpers de calcul (identiques au prototype validé) ----

export function toMin(hhmm: string | null | undefined): number | null {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Normalise une saisie libre en "HH:MM" (ex: 8h30, 20:15, 830, 8h, 8)
export function normalizeHeure(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let h: number, m = 0;
  if (s.includes("h")) s = s.replace("h", ":");
  if (s.includes(":")) {
    const [hs, ms] = s.split(":");
    h = parseInt(hs, 10);
    m = ms ? parseInt(ms, 10) : 0;
  } else if (/^\d+$/.test(s)) {
    if (s.length <= 2) { h = parseInt(s, 10); m = 0; }
    else if (s.length === 3) { h = parseInt(s[0], 10); m = parseInt(s.slice(1), 10); }
    else { h = parseInt(s.slice(0, 2), 10); m = parseInt(s.slice(2, 4), 10); }
  } else {
    return null;
  }
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Normalise une saisie libre en "YYYY-MM-DD" (ex: 25/08/2025, 2025-08-25, 25082025)
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const valid = (y: number, mo: number, d: number) =>
    y >= 1900 && y <= 2999 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;

  // AAAA/MM/JJ ou AAAA-MM-JJ
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (valid(y, mo, d))
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // JJ/MM/AAAA ou JJ/MM/AA
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    const yPart = m[3];
    const y = yPart.length === 4 ? parseInt(yPart, 10) : 2000 + parseInt(yPart, 10);
    if (valid(y, mo, d))
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // 8 chiffres -> JJMMAAAA, 6 chiffres -> JJMMAA
  const digits = s.replace(/\D/g, "");
  if (/^\d{8}$/.test(digits)) {
    const d = parseInt(digits.slice(0, 2), 10), mo = parseInt(digits.slice(2, 4), 10), y = parseInt(digits.slice(4, 8), 10);
    if (valid(y, mo, d))
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (/^\d{6}$/.test(digits)) {
    const d = parseInt(digits.slice(0, 2), 10), mo = parseInt(digits.slice(2, 4), 10), y = 2000 + parseInt(digits.slice(4, 6), 10);
    if (valid(y, mo, d))
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
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

// "HH:MM" (ou "H:MM") -> minutes, ou null si invalide
export function parseDureeMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const v = normalizeHeure(s);
  return v ? toMin(v) : null;
}

// minutes -> "HH:MM"
export function fmtMinToHeure(min: number | null | undefined): string {
  if (min === null || min === undefined) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
