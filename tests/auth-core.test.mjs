import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  hashIp,
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
