import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { verifySession, LONGUEUR_SECRET_MIN } from "@/lib/auth-core.mjs";
import type { SessionPayload } from "@/lib/auth-core.mjs";

export const SESSION_COOKIE = "umpj_session";
export const SESSION_TTL_S = 12 * 3600; // 12 heures

export type Role = "ADMIN" | "LECTEUR";

export type UtilisateurActuel = {
  id: string;
  email: string;
  role: Role;
};

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < LONGUEUR_SECRET_MIN) {
    throw new Error(
      `AUTH_SECRET manquant ou trop court (${LONGUEUR_SECRET_MIN} caractères minimum). Configurez-le (voir AUTH.md).`
    );
  }
  return s;
}

/** Lit et vérifie le jeton de session (signature + expiration). Aucune base de données. */
export async function lireSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifySession(token, secret());
  } catch {
    return null;
  }
}

/**
 * Vérifie le jeton PUIS l'état réel du compte en base :
 * compte existant, actif, et sessions non révoquées (logout / désactivation /
 * réinitialisation de mot de passe). Le rôle retourné est toujours celui de la
 * base, jamais celui du cookie seul.
 */
export async function getUtilisateurActuel(): Promise<UtilisateurActuel | null> {
  const session = await lireSession();
  if (!session) return null;
  const r = await pool.query(
    `SELECT id, email, role, actif, sessions_invalides_apres
     FROM "Utilisateur" WHERE id = $1`,
    [session.sub]
  );
  if (r.rowCount === 0) return null;
  const u = r.rows[0];
  if (!u.actif) return null;
  // iat est en millisecondes : comparaison à la milliseconde près, une
  // session émise AVANT la révocation est rejetée même dans la même seconde.
  if (session.iat < new Date(u.sessions_invalides_apres).getTime()) {
    return null;
  }
  return { id: u.id, email: u.email, role: u.role as Role };
}

export function reponseNonAuthentifie(): NextResponse {
  return NextResponse.json(
    { error: "Non authentifié." },
    { status: 401 }
  );
}

export function reponseInterdit(message = "Accès refusé."): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Garde serveur pour Route Handlers : exige un compte ACTIF.
 * Usage : const acces = await requireUser(); if (acces instanceof NextResponse) return acces;
 */
export async function requireUser(): Promise<UtilisateurActuel | NextResponse> {
  const u = await getUtilisateurActuel();
  if (!u) return reponseNonAuthentifie();
  return u;
}

/** Garde serveur : exige un compte ACTIF de rôle ADMIN. */
export async function requireAdmin(): Promise<UtilisateurActuel | NextResponse> {
  const u = await getUtilisateurActuel();
  if (!u) return reponseNonAuthentifie();
  if (u.role !== "ADMIN") return reponseInterdit("Réservé à l'administrateur.");
  return u;
}

/** Journalise une opération administrative (jamais de secret). */
export async function journaliser(
  acteur: string,
  action: string,
  cible: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO "JournalAdmin" (acteur, action, cible, detail)
       VALUES ($1, $2, $3, $4)`,
      [acteur, action, cible, JSON.stringify(detail)]
    );
  } catch {
    // Le journal ne doit jamais faire échouer l'opération protégée.
  }
}
