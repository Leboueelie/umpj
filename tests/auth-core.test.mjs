import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  hashIp,
  gardeActive,
  LONGUEUR_SECRET_MIN,
} from "../lib/auth-core.mjs";

const SECRET = "secret-de-test-avec-16-caracteres-minimum";

test("hashPassword / verifyPassword : bon mot de passe", () => {
  const h = hashPassword("MotDePasse123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(verifyPassword("MotDePasse123", h), true);
});

test("verifyPassword : mauvais mot de passe refusé", () => {
  const h = hashPassword("MotDePasse123");
  assert.equal(verifyPassword("MotDePasse124", h), false);
  assert.equal(verifyPassword("", h), false);
});

test("hashPassword : refuse < 8 caractères", () => {
  assert.throws(() => hashPassword("court"));
});

test("verifyPassword : hash malformé refusé", () => {
  assert.equal(verifyPassword(" MotDePasse123", "nimporte"), false);
  assert.equal(verifyPassword(" MotDePasse123", "scrypt$1$2$3$bad"), false);
});

test("verifyPassword : paramètres scrypt hors bornes refusés (sans calcul lourd)", () => {
  const h = hashPassword("MotDePasse123");
  const [algo, , r, p, salt, hash] = h.split("$");
  // N sous la borne minimale / hors puissance de deux / énorme : rejet immédiat.
  assert.equal(verifyPassword("MotDePasse123", `scrypt$1$${r}$${p}$${salt}$${hash}`), false);
  assert.equal(verifyPassword("MotDePasse123", `scrypt$100$${r}$${p}$${salt}$${hash}`), false);
  assert.equal(verifyPassword("MotDePasse123", `scrypt$2147483648$${r}$${p}$${salt}$${hash}`), false);
  // r et p hors bornes.
  assert.equal(verifyPassword("MotDePasse123", `scrypt$16384$2$${p}$${salt}$${hash}`), false);
  assert.equal(verifyPassword("MotDePasse123", `scrypt$16384$${r}$64$${salt}$${hash}`), false);
  // Longueur de hash attendue arbitraire (coût mémoire imposé) : refusée.
  assert.equal(verifyPassword("MotDePasse123", `scrypt$16384$${r}$${p}$${salt}$${Buffer.alloc(1000000).toString("base64")}`), false);
  // Sel de longueur aberrante : refusée.
  assert.equal(verifyPassword("MotDePasse123", `scrypt$16384$${r}$${p}$${Buffer.alloc(2).toString("base64")}$${hash}`), false);
  // Valeurs légères mais valides : toujours acceptées.
  assert.equal(verifyPassword("MotDePasse123", h), true);
});

test("verifySession : champs du jeton strictement validés", () => {
  const nowSec = 1700000000;
  const forge = (payload) =>
    `v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${Buffer.from("x").toString("base64url")}`;
  // iat fractionnaire (cassait la requête SQL du proxy) : refusé.
  assert.equal(
    verifySession(forge({ sub: "u-1", role: "ADMIN", iat: nowSec * 1000 + 0.5, exp: nowSec + 3600 }), SECRET, nowSec),
    null
  );
  // exp fractionnaire : refusé.
  assert.equal(
    verifySession(forge({ sub: "u-1", role: "ADMIN", iat: nowSec * 1000, exp: nowSec + 3600.5 }), SECRET, nowSec),
    null
  );
  // iat négatif : refusé.
  assert.equal(
    verifySession(forge({ sub: "u-1", role: "ADMIN", iat: -1, exp: nowSec + 3600 }), SECRET, nowSec),
    null
  );
  // sub absent / trop long : refusé.
  assert.equal(
    verifySession(forge({ role: "ADMIN", iat: nowSec * 1000, exp: nowSec + 3600 }), SECRET, nowSec),
    null
  );
  assert.equal(
    verifySession(forge({ sub: "u".repeat(101), role: "ADMIN", iat: nowSec * 1000, exp: nowSec + 3600 }), SECRET, nowSec),
    null
  );
  // Le roundtrip légitime reste accepté.
  const token = signSession({ sub: "u-1", role: "ADMIN", iat: nowSec * 1000, exp: nowSec + 3600 }, SECRET);
  assert.notEqual(verifySession(token, SECRET, nowSec), null);
});

test("signSession : refuse un secret plus court que LONGUEUR_SECRET_MIN", () => {
  assert.equal(LONGUEUR_SECRET_MIN, 32);
  const court = "a".repeat(LONGUEUR_SECRET_MIN - 1);
  assert.throws(() => signSession({ sub: "u-1", role: "ADMIN", iat: 0, exp: 1 }, court));
  assert.throws(() => signSession({ sub: "u-1", role: "ADMIN", iat: 0, exp: 1 }, ""));
  assert.throws(() => signSession({ sub: "u-1", role: "ADMIN", iat: 0, exp: 1 }, null));
});

test("signSession : accepte un secret de LONGUEUR_SECRET_MIN", () => {
  const secret32 = "a".repeat(LONGUEUR_SECRET_MIN);
  const token = signSession({ sub: "u-1", role: "ADMIN", iat: 0, exp: 1 }, secret32);
  assert.ok(token.startsWith("v1."));
});

test("signSession / verifySession : roundtrip (iat en ms, exp en s)", () => {
  const nowSec = 1700000000;
  const token = signSession(
    { sub: "u-1", role: "ADMIN", iat: nowSec * 1000 + 123, exp: nowSec + 3600 },
    SECRET
  );
  const p = verifySession(token, SECRET, nowSec + 10);
  assert.equal(p.sub, "u-1");
  assert.equal(p.role, "ADMIN");
  assert.equal(p.iat, nowSec * 1000 + 123);
});

test("verifySession : jeton expiré refusé", () => {
  const now = 1700000000;
  const token = signSession({ sub: "u-1", role: "ADMIN", iat: now * 1000, exp: now + 60 }, SECRET);
  assert.equal(verifySession(token, SECRET, now + 61), null);
});

test("verifySession : signature falsifiée refusée", () => {
  const now = 1700000000;
  const token = signSession({ sub: "u-1", role: "ADMIN", iat: now * 1000, exp: now + 3600 }, SECRET);
  const parts = token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  payload.role = "LECTEUR"; // tentative d'élévation de privilèges
  const forged = `v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
  assert.equal(verifySession(forged, SECRET, now), null);
});

test("verifySession : secret différent refusé", () => {
  const now = 1700000000;
  const token = signSession({ sub: "u-1", role: "ADMIN", iat: now * 1000, exp: now + 3600 }, SECRET);
  assert.equal(verifySession(token, "autre-secret-suffisamment-long!", now), null);
});

test("verifySession : jeton malformé refusé", () => {
  assert.equal(verifySession("abc", SECRET), null);
  assert.equal(verifySession("v1.aa.bb", SECRET), null);
  assert.equal(verifySession("", SECRET), null);
});

test("hashIp : déterministe et non réversible en clair", () => {
  const a = hashIp("1.2.3.4", SECRET);
  const b = hashIp("1.2.3.4", SECRET);
  const c = hashIp("1.2.3.5", SECRET);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes("1.2.3.4"));
});

test("gardeActive : jamais 'off' en production", () => {
  assert.equal(gardeActive({ NODE_ENV: "production", AUTH_GARDE: "off" }), true);
  assert.equal(gardeActive({ NODE_ENV: "production" }), true);
});

test("gardeActive : 'off' possible hors production uniquement", () => {
  assert.equal(gardeActive({ NODE_ENV: "development", AUTH_GARDE: "off" }), false);
  assert.equal(gardeActive({ NODE_ENV: "test", AUTH_GARDE: "off" }), false);
});

test("gardeActive : active par défaut hors production", () => {
  assert.equal(gardeActive({ NODE_ENV: "development" }), true);
  assert.equal(gardeActive({ NODE_ENV: "development", AUTH_GARDE: "tout" }), true);
  assert.equal(gardeActive({}), true);
});
