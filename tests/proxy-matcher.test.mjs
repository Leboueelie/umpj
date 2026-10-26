// Tests ciblés de la couverture des en-têtes de sécurité du proxy (mission
// corrective : refus API couverts + page /login couverte).
// NOTE d'infrastructure : proxy.ts n'est PAS importable par node:test (alias
// "@/lib" résolus uniquement par le bundler Next, dépendance next/server).
// Ces tests vérifient donc la SOURCE : la regex du matcher extraite du
// fichier (sémantique ^/((?!…).*)$), la présence/l'ordre des branches clés
// et les invariants de la mission (HSTS inchangé, aucune CSP).
// Exécution : `node --test tests/*.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

function matcherProxy() {
  const apresMatcher = source.slice(source.indexOf("matcher:"));
  const brut = apresMatcher.match(/"((?:[^"\\]|\\.)*)"/)[1];
  // "\\." dans la source TS devient "\." dans la regex réelle.
  const motif = brut.replace(/\\\\/g, "\\");
  return new RegExp(`^${motif}$`);
}

const passeParProxy = matcherProxy();

test("matcher : /login passe désormais par le proxy (cible de la correction)", () => {
  assert.equal(passeParProxy.test("/login"), true);
});

test("matcher : chemins protégés inchangés", () => {
  for (const p of [
    "/", "/banque", "/admin/utilisateurs", "/api/lignes",
    "/api/auth/login", "/api/auth/logout", "/autre/login", "/admin/login",
    "/zones/fiche/2025-01", "/api/zones/entrees", "/login/",
  ]) {
    assert.equal(passeParProxy.test(p), true, `devrait couvrir ${p}`);
  }
});

test("matcher : assets statiques toujours exclus", () => {
  for (const p of [
    "/_next/static/chunk.js", "/_next/image/a", "/logo.png", "/icon.png",
    "/favicon.ico", "/police.woff2", "/photo.jpeg", "/ico.svg",
  ]) {
    assert.equal(passeParProxy.test(p), false, `devrait exclure ${p}`);
  }
});

test("source : branche publique /login AVANT le contrôle CSRF, sans redirection", () => {
  const branche = source.indexOf('pathname === "/login"');
  const csrf = source.indexOf("if (csrfRefuse(request))");
  assert.ok(branche > -1, "branche /login absente de proxy()");
  assert.ok(csrf > -1, "appel CSRF introuvable dans proxy()");
  assert.ok(branche < csrf, "la branche /login doit précéder le contrôle CSRF");
  // Passage au rendu direct : aucun redirect dans la branche.
  const corps = source.slice(branche, branche + 220);
  assert.match(corps, /NextResponse\.next\(\)/);
  assert.doesNotMatch(corps, /redirect/);
});

test("source : refusApi applique enTetesSecurite (couvre 401/403/500/503 API)", () => {
  const fn = source.match(/function refusApi[\s\S]*?\n}/)[0];
  assert.match(fn, /enTetesSecurite\(/);
  assert.match(fn, /NextResponse\.json/, "corps JSON préservé");
});

test("source : invariants de la mission — HSTS inchangé, aucune CSP ajoutée", () => {
  assert.ok(source.includes("max-age=31536000; includeSubDomains"));
  assert.ok(!source.includes("Content-Security-Policy"));
});
