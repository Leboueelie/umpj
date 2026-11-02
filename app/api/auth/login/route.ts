import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  signSession,
  hashIp,
  premiereIp,
} from "@/lib/auth-core.mjs";
import {
  SESSION_COOKIE,
  SESSION_TTL_S,
  journaliser,
} from "@/lib/auth";
import { normaliserNom } from "@/lib/normalisation";

const MAX_TENTATIVES_EMAIL = 10;
const MAX_TENTATIVES_IP = 5;
const FENETRE_MS = 15 * 60 * 1000;

// Hash factice (réel) pour uniformiser le temps de réponse quand l'email
// n'existe pas — évite l'énumération d'utilisateurs par chronométrage.
const HASH_DUMMY = hashPassword("dummy-password-timing-only");

function generique() {
  return NextResponse.json(
    { error: "Identifiants invalides." },
    { status: 401 }
  );
}

/**
 * Incrémente atomiquement le compteur de tentatives.
 * Une seule requête SQL gère l'insertion, l'incrémentation et la réinitialisation
 * de fenêtre expirée. Pas de lecture préalable — pas de course entre requêtes concurrentes.
 */
async function enregistrerEchec(cle: string) {
  await pool.query(
    `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
     VALUES ($1, 1, now(), now())
     ON CONFLICT (cle) DO UPDATE SET
       tentatives = CASE
         WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN 1
         ELSE "TentativeConnexion".tentatives + 1
       END,
       premiere_tentative = CASE
         WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN now()
         ELSE "TentativeConnexion".premiere_tentative
       END,
       derniere_tentative = now()`,
    [cle]
  );
}

/**
 * Supprime les clés expirées (plus d'une heure) pour limiter l'accumulation.
 * Limite à 100 lignes par appel pour éviter une surcharge.
 */
async function nettoyerExpires() {
  try {
    await pool.query(
      `DELETE FROM "TentativeConnexion" WHERE cle IN (
         SELECT cle FROM "TentativeConnexion"
         WHERE premiere_tentative < now() - INTERVAL '1 hour'
         LIMIT 100
       )`
    );
  } catch {
    // Le nettoyage ne doit pas faire échouer la connexion.
  }
}

async function bloque(cle: string, maxTentatives: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT tentatives, derniere_tentative
     FROM "TentativeConnexion" WHERE cle = $1`,
    [cle]
  );
  if (!r.rowCount || r.rows[0].tentatives < maxTentatives) return false;
  const age =
    Date.now() - new Date(r.rows[0].derniere_tentative).getTime();
  return age <= FENETRE_MS;
}

async function reinitialiser(cles: string[]) {
  await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle = ANY($1)`, [cles]);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const identifiantBrut =
    typeof body?.nom === "string"
      ? body.nom.trim()
      : typeof body?.nomComplet === "string"
        ? body.nomComplet.trim()
        : typeof body?.name === "string"
          ? body.name.trim()
          : typeof body?.email === "string"
            ? body.email.trim()
            : "";
  const motDePasse = typeof body?.motDePasse === "string" ? body.motDePasse : "";

  if (!identifiantBrut || identifiantBrut.length > 254 || !motDePasse || motDePasse.length > 200) {
    return generique();
  }

  const ip = premiereIp(req);
  const nomNormalise = normaliserNom(identifiantBrut);
  const cleIdentifiant = `identifiant:${nomNormalise || identifiantBrut.toLowerCase()}`;
  const cleIp = ip ? `ip:${hashIp(ip, process.env.AUTH_SECRET ?? "")}` : null;

  try {
    if (await bloque(cleIdentifiant, MAX_TENTATIVES_EMAIL)) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }
    if (cleIp && (await bloque(cleIp, MAX_TENTATIVES_IP))) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    // Vérifier si la colonne "nom" existe (migration appliquée ou non).
    let colonneNomDisponible = false;
    try {
      const col = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'Utilisateur' AND column_name = 'nom'`
      );
      colonneNomDisponible = (col.rowCount ?? 0) > 0;
    } catch {
      colonneNomDisponible = false;
    }

    let u: { id: string; email: string; nom: string | null; hash: string; role: string; actif: boolean } | null = null;

    // Recherche par nom normalisé (si la colonne existe).
    // Aucun repli par e-mail : le nom est désormais le seul identifiant.
    if (colonneNomDisponible && nomNormalise) {
      try {
        const rNom = await pool.query(
          `SELECT id, email, nom, hash, role, actif FROM "Utilisateur"
           WHERE lower(regexp_replace(trim("nom"), '\\s+', ' ', 'g')) = $1`,
          [nomNormalise]
        );
        if (rNom.rowCount) u = rNom.rows[0];
      } catch {
        colonneNomDisponible = false;
      }
    }

    const hash = u ? u.hash : HASH_DUMMY;
    const ok = verifyPassword(motDePasse, hash);

    if (!u || !ok) {
      await enregistrerEchec(cleIdentifiant);
      if (cleIp) await enregistrerEchec(cleIp);
      await nettoyerExpires();
      return generique();
    }

    if (!u.actif) {
      // Réponse générique identique à un échec d'identifiants.
      return generique();
    }

    await reinitialiser([cleIdentifiant, ...(cleIp ? [cleIp] : [])]);

    const maintenantSec = Math.floor(Date.now() / 1000);
    const jeton = signSession(
      { sub: u.id, role: u.role as "ADMIN" | "LECTEUR", iat: Date.now(), exp: maintenantSec + SESSION_TTL_S },
      process.env.AUTH_SECRET ?? ""
    );

    const store = await cookies();
    store.set(SESSION_COOKIE, jeton, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_S,
    });

    await journaliser(u.id, "connexion", u.id, {});

    return NextResponse.json({
      ok: true,
      email: u.email,
      nom: u.nom ?? null,
      role: u.role,
      redirect: u.role === "ADMIN" ? "/" : "/banque",
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur de service." },
      { status: 500 }
    );
  }
}
