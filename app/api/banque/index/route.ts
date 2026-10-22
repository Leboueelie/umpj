import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { executerIndex, type RequeteDb } from "@/lib/banque-api";

/**
 * GET /api/banque/index — métadonnées d'initialisation des filtres Banque.
 *
 * Contrat :
 * - 401 { error } : non authentifié, compte désactivé ou session révoquée
 *   (requireUser — ADMIN et LECTEUR sont acceptés, aucun filtre de rôle) ;
 * - 200 : {
 *     maisons:   { donnees, nbLignes, periode: { du, au } | null },
 *     zones:     { donnees, nbEntrees, mois: string[] },
 *     editions:  { donnees, nbEditions, editions: [{ numero, dateDebut, dateFin }] }
 *   } — dates d'éditions normalisées "YYYY-MM-DD" (null si source illisible) ;
 *   aucune période n'est inventée quand la table est vide (periode: null) ;
 *   maisons.periode borne les dates CALENDRIAIRES valides ; les dates non
 *   calendaires ne sont pas exposées ici (décision B3-C, contrat inchangé)
 *   — elles remontent en catégorie C via /api/banque/resume, toute période ;
 * - 500 { error: "Erreur de service." } : échec base, sans détail interne.
 *
 * Lecture seule (SELECT uniquement, aucune donnée personnelle), sans filtre
 * Abidjan/Intérieur (hors périmètre B3).
 */
export async function GET() {
  const acces = await requireUser();
  if (acces instanceof NextResponse) return acces;

  const requete: RequeteDb = (texte, params) =>
    params === undefined
      ? pool.query(texte)
      : pool.query(texte, params as unknown[]);
  const rep = await executerIndex(requete);
  if (!rep.ok) {
    return NextResponse.json({ error: rep.erreur }, { status: rep.status });
  }
  return NextResponse.json(rep.donnees);
}
