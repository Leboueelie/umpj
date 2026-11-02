// Limites et validations pour les imports JSON (AUD-003.2).
// Fonctions pures, testables sans base ni serveur.

export const MAX_CAHIER_COUNT = 100;
export const MAX_LIGNES_PER_CAHIER = 5000;
export const MAX_LIGNES_TOTAL = 100000;
export const MAX_ZONE_ENTRIES = 200;
export const MAX_NOM_LENGTH = 200;
export const MAX_ZONE_NAME_LENGTH = 150;

export type ResultatValidation =
  | { ok: true }
  | { ok: false; erreur: string };

export function validerImportCahiers(cahiers: unknown): ResultatValidation {
  if (!Array.isArray(cahiers)) {
    return { ok: false, erreur: "cahiers doit être un tableau." };
  }
  if (cahiers.length === 0) {
    return { ok: false, erreur: "Aucun cahier à importer." };
  }
  if (cahiers.length > MAX_CAHIER_COUNT) {
    return { ok: false, erreur: `Maximum ${MAX_CAHIER_COUNT} cahiers par requête.` };
  }

  let totalLignes = 0;
  for (const ic of cahiers) {
    if (typeof ic !== "object" || ic === null || Array.isArray(ic)) {
      return { ok: false, erreur: "Chaque cahier doit être un objet." };
    }
    const nom = (ic as Record<string, unknown>).nom;
    if (nom !== undefined && nom !== null && typeof nom !== "string" && typeof nom !== "number") {
      return { ok: false, erreur: "Le nom du cahier doit être une chaîne." };
    }
    const nomStr = String(nom ?? "").trim();
    if (nomStr.length > MAX_NOM_LENGTH) {
      return { ok: false, erreur: `Nom de cahier trop long (max ${MAX_NOM_LENGTH}).` };
    }
    const lignes = (ic as Record<string, unknown>).lignes;
    if (lignes !== undefined && lignes !== null && !Array.isArray(lignes)) {
      return { ok: false, erreur: "Les lignes du cahier doivent être un tableau." };
    }
    const nbLignes = Array.isArray(lignes) ? lignes.length : 0;
    if (nbLignes > MAX_LIGNES_PER_CAHIER) {
      return { ok: false, erreur: `Maximum ${MAX_LIGNES_PER_CAHIER} lignes par cahier.` };
    }
    totalLignes += nbLignes;
    if (totalLignes > MAX_LIGNES_TOTAL) {
      return { ok: false, erreur: `Maximum ${MAX_LIGNES_TOTAL} lignes au total.` };
    }
  }
  return { ok: true };
}

export function validerImportZones(mois: unknown, lignes: unknown): ResultatValidation {
  if (typeof mois !== "string") {
    return { ok: false, erreur: "mois doit être une chaîne." };
  }
  const moisStr = mois.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(moisStr)) {
    return { ok: false, erreur: "mois invalide (YYYY-MM)." };
  }
  if (!Array.isArray(lignes)) {
    return { ok: false, erreur: "lignes doit être un tableau." };
  }
  if (lignes.length > MAX_ZONE_ENTRIES) {
    return { ok: false, erreur: `Maximum ${MAX_ZONE_ENTRIES} entrées de zones par requête.` };
  }
  for (const l of lignes) {
    if (typeof l !== "object" || l === null || Array.isArray(l)) {
      return { ok: false, erreur: "Chaque entrée de zone doit être un objet." };
    }
    const zone = String((l as Record<string, unknown>).zone ?? "").trim();
    if (zone.length > MAX_ZONE_NAME_LENGTH) {
      return { ok: false, erreur: `Nom de zone trop long (max ${MAX_ZONE_NAME_LENGTH}).` };
    }
  }
  return { ok: true };
}
