/**
 * Normalisation des noms complets pour la connexion UMPJ (mission FRONT-39).
 *
 * Règles (validées) :
 *  - suppression des espaces au début et à la fin ;
 *  - remplacement des suites d'espaces par un seul espace ;
 *  - passage en minuscules (comparaison insensible à la casse) ;
 *  - conservation des accents et des caractères spéciaux (pas de suppression).
 *
 * Fonction pure, sans dépendance, testable directement.
 */

export function normaliserNom(nom: string | null | undefined): string {
  if (typeof nom !== "string") return "";
  return nom.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Variante pour la clé de rate limiting (préfixe + nom normalisé). */
export function cleRateLimitNom(nom: string): string {
  return `nom:${normaliserNom(nom)}`;
}
