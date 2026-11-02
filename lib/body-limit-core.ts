// Logique pure de validation de taille de corps (AUD-003.1b).
// Aucune dépendance Next.js — testable sans framework HTTP.

export const LIMITE_JSON = 5 * 1024 * 1024; // 5 Mo
export const LIMITE_PDF = 11 * 1024 * 1024; // 11 Mo (fichier 10 Mo + marge)
export const LIMITE_EDITION = 11 * 1024 * 1024; // 11 Mo

export type ResultatTaille =
  | { ok: true }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Validation pure de l'en-tête Content-Length.
 * - Absent (null) → accepté (pas de rejet possible).
 * - Vide ("") → rejeté (400) : en-tête malformé.
 * - Chaîne non numérique, signée, avec espaces/virgules/notation scientifique
 *   ou hors de la plage sûre → rejeté (400).
 * - Valeur valide supérieure à la limite → rejeté (413).
 * - Valeur valide ≤ limite → accepté.
 */
export function validerTailleDeclaree(
  cl: string | null,
  limite: number
): ResultatTaille {
  if (cl === null) {
    return { ok: true };
  }
  if (cl === "") {
    return { ok: false, status: 400, error: "En-tête Content-Length invalide." };
  }
  if (!/^\d+$/.test(cl)) {
    return { ok: false, status: 400, error: "En-tête Content-Length invalide." };
  }
  const n = Number(cl);
  if (!Number.isSafeInteger(n)) {
    return { ok: false, status: 400, error: "En-tête Content-Length hors de la plage numérique sûre." };
  }
  if (n > limite) {
    return { ok: false, status: 413, error: "Le corps de la requête dépasse la taille maximale autorisée." };
  }
  return { ok: true };
}
