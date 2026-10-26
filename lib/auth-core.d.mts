export interface SessionPayload {
  sub: string;
  role: "ADMIN" | "LECTEUR";
  /** Émission en millisecondes Unix (précision de la révocation). */
  iat: number;
  /** Expiration en secondes Unix. */
  exp: number;
}

export function hashPassword(password: string): string;
export function verifyPassword(password: string, stored: string): boolean;
export function signSession(payload: SessionPayload, secret: string): string;
export function verifySession(
  token: string,
  secret: string,
  nowSec?: number
): SessionPayload | null;
export function hashIp(ip: string, secret: string): string;
export function premiereIp(request: Request): string | null;

/** Longueur minimale de AUTH_SECRET (32 octets aléatoires recommandés). */
export const LONGUEUR_SECRET_MIN: number;

/**
 * Garde globale : AUTH_GARDE="off" n'est jamais accepté en production
 * (NODE_ENV=production). Défaut : garde active.
 */
export function gardeActive(
  env?: Pick<NodeJS.ProcessEnv, "NODE_ENV" | "AUTH_GARDE">
): boolean;
