// Lecture bornée du corps de requête HTTP (AUD-003.1-STREAMING).
//
// Next.js App Router ne permet pas de limiter le streaming de req.json() ou
// req.formData() sans refonte complète du parsing. Ce module fournit une lecture
// en flux avec plafond d'octets pour les routes JSON.
//
// Limitation : les routes multipart (formData) ne sont pas couvertes par ce
// module. Elles conservent la vérification Content-Length + post-parse file.size.

import { LIMITE_JSON } from "./body-limit-core.ts";

export type ResultatLectureJson =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Lit le corps de la requête en flux, en comptant les octets réellement reçus.
 * S'interrompt dès que la limite est dépassée, sans accumuler le reste.
 *
 * @returns Le buffer lu, ou null si la limite est dépassée ou si une erreur
 *          de lecture s'est produite.
 */
async function lireCorpsBorne(
  req: Request,
  limite: number
): Promise<{ buffer: Buffer | null; depasse: boolean; erreurLecture: boolean }> {
  const stream = req.body;
  if (!stream) {
    return { buffer: Buffer.alloc(0), depasse: false, erreurLecture: false };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let depasse = false;
  let erreurLecture = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) {
        depasse = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } catch {
    erreurLecture = true;
    try {
      await reader.cancel();
    } catch {
      // ignore cancel errors
    }
  }

  if (depasse || erreurLecture) {
    return { buffer: null, depasse, erreurLecture };
  }
  return { buffer: Buffer.concat(chunks), depasse: false, erreurLecture: false };
}

/**
 * Lit et parse le corps JSON d'une requête avec une limite d'octets réels.
 * - Corps vide ou espaces → {} (comportement historique préservé).
 * - Corps dépassant la limite → { ok: false, status: 413 }.
 * - Corps non-JSON ou erreur de lecture → { ok: false, status: 400 }.
 * - Corps JSON valide → { ok: true, body: parsed }.
 */
export async function lireJsonBorne(
  req: Request,
  limite: number = LIMITE_JSON
): Promise<ResultatLectureJson> {
  const corps = await lireCorpsBorne(req, limite);
  if (corps.depasse) {
    return { ok: false, status: 413, error: "Le corps de la requête dépasse la taille maximale autorisée." };
  }
  if (corps.erreurLecture) {
    return { ok: false, status: 400, error: "Erreur de lecture du corps de la requête." };
  }
  const buffer = corps.buffer!;
  const text = buffer.toString("utf8");
  if (text.trim() === "") {
    return { ok: true, body: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "Corps JSON invalide." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: true, body: {} };
  }
  return { ok: true, body: parsed };
}

/**
 * Lit le corps de la requête en flux, en comptant les octets réellement reçus.
 * S'interrompt dès que la limite est dépassée, sans accumuler le reste.
 * Retourne le buffer lu, ou null si la limite est dépassée ou en cas d'erreur.
 *
 * Utilisable pour les routes multipart : le buffer peut être réinjecté dans un
 * nouveau Request pour appeler formData() sans avoir bufferisé tout le corps.
 */
export async function lireBufferBorne(
  req: Request,
  limite: number
): Promise<Buffer | null> {
  const stream = req.body;
  if (!stream) return Buffer.alloc(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) {
        await reader.cancel();
        return null; // dépassé
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* ignore */ }
    return null; // erreur de lecture
  }

  return Buffer.concat(chunks);
}
