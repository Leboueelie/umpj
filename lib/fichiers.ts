// Aide à la sécurisation des fichiers PDF stockés en base (BYTEA) :
// - validation du contenu réel (octets magiques), pas seulement du MIME déclaré ;
// - construction sûre de l'en-tête Content-Disposition (anti injection d'en-tête).

const PDF_MAGIC = "%PDF-";
const NOM_MAX = 150;

/** Vérifie que le contenu binaire commence par les octets magiques d'un PDF. */
export function estPdf(buffer: Buffer): boolean {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= PDF_MAGIC.length &&
    buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC
  );
}

/**
 * Nom de fichier sûr pour un en-tête HTTP : supprime CR/LF, guillemets,
 * antislashs et caractères de contrôle (anti injection d'en-tête), borne la
 * longueur. Retourne une valeur de secours si le résultat est vide.
 */
export function nomFichierSur(nom: unknown): string {
  const s = String(nom ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f"\\]/g, " ")
    .trim();
  const borne = s.slice(0, NOM_MAX).trim();
  return borne.length > 0 ? borne : "document.pdf";
}

/**
 * Content-Disposition sûr : nom ASCII en secours (compatibilité maximale) et
 * forme RFC 5987 (filename*) encodée en pourcentage pour préserver l'UTF-8.
 */
export function enteteContentDisposition(nom: unknown): string {
  const sur = nomFichierSur(nom);
  const ascii = sur.replace(/[^\x20-\x7e]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(sur)}`;
}
