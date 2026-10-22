import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { executerResume, type RequeteDb } from "@/lib/banque-api";

/**
 * GET /api/banque/resume — rapport agrégé de période (moteur B2-F).
 *
 * Paramètres : `du` et `au` (requis ; JJ/MM/AAAA ou ISO acceptés, normalisés
 * par normaliserPeriode).
 *
 * Contrat :
 * - 401 { error } : non authentifié, compte désactivé ou session révoquée
 *   (requireUser — ADMIN et LECTEUR acceptés) ;
 * - 400 { error: "du et au sont requis." } : paramètre manquant ;
 * - 400 { error: "Période invalide : bornes illisibles, non calendaires ou du > au." } ;
 * - 200 : RapportBanque {
 *     periode: { du, au },
 *     maisons | zones | editions: {
 *       nbTotal, nbRetenues, agregat,
 *       anomaliesDisponibles,   // cat. A : anomalies des données effectivement
 *                               // fournies au moteur — pas un inventaire
 *                               // exhaustif de la base (les lignes valides
 *                               // hors période ne sont pas fournies)
 *       anomaliesPeriode,       // cat. B : seules les lignes retenues (⊆ A)
 *       nonEvaluables           // cat. C : période indéterminable, hors B
 *     }
 *   } — trois sections distinctes, jamais de total général inter-modules,
 *   valeurs absentes conservées (null / « — »), aucune correction silencieuse ;
 *   toute date de maison non calendaire (forme incorrecte ou date inexistante
 *   comme "2025-02-31") est fournie et remonte en C quelle que soit la
 *   période demandée (B3-C) ;
 * - 500 { error: "Erreur de service." } : échec base, sans détail interne.
 *
 * Lecture seule : SELECT paramétrés uniquement ; les dates d'éditions (DATE pg)
 * sont normalisées à la frontière de chargement avant le moteur.
 */
export async function GET(req: Request) {
  const acces = await requireUser();
  if (acces instanceof NextResponse) return acces;

  const { searchParams } = new URL(req.url);
  const requete: RequeteDb = (texte, params) =>
    params === undefined
      ? pool.query(texte)
      : pool.query(texte, params as unknown[]);
  const rep = await executerResume(requete, searchParams);
  if (!rep.ok) {
    return NextResponse.json({ error: rep.erreur }, { status: rep.status });
  }
  return NextResponse.json(rep.donnees);
}
