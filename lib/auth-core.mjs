import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Primitives d'authentification (aucune dépendance externe).
// Utilisées par l'application (via lib/auth.ts) et par les tests node:test.

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/** Hache un mot de passe. Format : scrypt$N$r$p$saltB64$hashB64 */
export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Mot de passe trop court (8 caractères minimum).");
  }
  if (password.length > 200) {
    throw new Error("Mot de passe trop long.");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Vérifie un mot de passe contre un hash stocké. Comparaison en temps constant. */
export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt, expected;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual;
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function hmac(secret, data) {
  return createHmac("sha256", secret).update(data).digest();
}

/**
 * Signe un jeton de session : "v1.<payloadB64url>.<sigB64url>".
 * payload : { sub, role, iat, exp } — exp/iat en secondes Unix.
 */
export function signSession(payload, secret) {
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET absent ou trop court (16 caractères minimum).");
  }
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(secret, `v1.${body}`));
  return `v1.${body}.${sig}`;
}

/**
 * Vérifie un jeton : format, signature (temps constant) et expiration.
 * Retourne le payload ou null. Ne fait AUCUNE confiance au rôle sans
 * vérification serveur complémentaire (voir lib/auth.ts).
 */
export function verifySession(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const body = parts[1];
  const sig = parts[2];
  let expected;
  try {
    expected = b64url(hmac(secret, `v1.${body}`));
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  if (typeof payload.iat !== "number") return null;
  if (payload.exp <= nowSec) return null;
  return payload;
}

/** Empreinte irréversible (HMAC-SHA-256) pour les adresses IP de limitation. */
export function hashIp(ip, secret) {
  if (!secret) throw new Error("AUTH_SECRET manquant pour l'empreinte IP.");
  return hmac(secret, `ip:${ip}`).toString("base64url");
}

/** Récupère la première adresse IP fiable de l'en-tête X-Forwarded-For (défini par Vercel). */
export function premiereIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0].trim();
  return first || null;
}
