// Garde de taille de corps de requête (AUD-003.1).
//
// Next.js App Router ne permet pas de limiter le streaming de req.json() ou
// req.formData() sans refonte complète du parsing. Ce module fournit :
//   1. une vérification préalable sur l'en-tête Content-Length (si présent) ;
//   2. aucune vérification post-parsing — la taille réelle des octets lus n'est
//      pas bornée par ce module. Les routes peuvent appliquer leurs propres
//      contrôles après parsing (ex. file.size pour les PDF), mais cela intervient
//      après la bufferisation complète du corps.
//
// Limitation honnête : un client malveillant peut envoyer un corps volumineux
// sans Content-Length (ou avec un Content-Length falsifié à la baisse) ; le
// serveur le bufferise avant de le rejeter. La protection complète exigerait
// un parsing en streaming (hors périmètre de cette mission).

import { NextResponse } from "next/server";
import {
  LIMITE_JSON,
  LIMITE_PDF,
  LIMITE_EDITION,
  validerTailleDeclaree,
  type ResultatTaille,
} from "./body-limit-core";

export { LIMITE_JSON, LIMITE_PDF, LIMITE_EDITION, validerTailleDeclaree };
export type { ResultatTaille };

/**
 * Vérifie l'en-tête Content-Length avant parsing.
 * Retourne null si OK, ou une NextResponse 400/413 si la taille déclarée est
 * invalide ou dépasse la limite.
 */
export function verifierTailleDeclaree(
  req: Request,
  limite: number
): NextResponse | null {
  const cl = req.headers.get("content-length");
  const res = validerTailleDeclaree(cl, limite);
  if (res.ok) return null;
  return NextResponse.json({ error: res.error }, { status: res.status });
}
