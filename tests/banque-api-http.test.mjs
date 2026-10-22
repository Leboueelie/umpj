// Vérifications HTTP réelles des routes Banque (mission B3) : autorisation
// (ADMIN / LECTEUR / anonyme) et contrats d'erreur, contre un serveur local
// et une base de test LOCALE explicite. Aucun appel prod.
//
// Par défaut (`npm test`) : ignoré (aucun serveur requis).
// Exécution manuelle (voir rapport B3) :
//   BANQUE_E2E_URL=http://127.0.0.1:3999 \
//   BANQUE_E2E_COOKIE_ADMIN='umpj_session=...' \
//   BANQUE_E2E_COOKIE_LECTEUR='umpj_session=...' \
//   node --test tests/banque-api-http.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.BANQUE_E2E_URL;
const cookieAdmin = process.env.BANQUE_E2E_COOKIE_ADMIN;
const cookieLecteur = process.env.BANQUE_E2E_COOKIE_LECTEUR;
const actif = Boolean(base && cookieAdmin && cookieLecteur);
const opts = {
  skip: actif
    ? false
    : "BANQUE_E2E_URL / BANQUE_E2E_COOKIE_* non définis (exécution manuelle)",
};

const get = (chemin, cookie) =>
  fetch(`${base}${chemin}`, cookie ? { headers: { cookie } } : undefined);

test("routes : anonyme refusé 401 sur index et resume", opts, async () => {
  const r1 = await get("/api/banque/index");
  assert.equal(r1.status, 401);
  const b1 = await r1.json();
  assert.ok("error" in b1, "format { error } respecte");

  const r2 = await get("/api/banque/resume?du=2026-02-01&au=2026-02-28");
  assert.equal(r2.status, 401);
  const b2 = await r2.json();
  assert.ok("error" in b2);
  assert.ok(!/"maisons"/.test(JSON.stringify(b2)), "aucune donnee de rapport pour un anonyme");
});

test("index : ADMIN et LECTEUR autorisés — 200, structure et dates YYYY-MM-DD", opts, async () => {
  for (const [role, cookie] of [["ADMIN", cookieAdmin], ["LECTEUR", cookieLecteur]]) {
    const r = await get("/api/banque/index", cookie);
    assert.equal(r.status, 200, `index ${role}`);
    const b = await r.json();
    assert.deepEqual(Object.keys(b).sort(), ["editions", "maisons", "zones"]);
    assert.ok("donnees" in b.maisons && "nbLignes" in b.maisons && "periode" in b.maisons);
    assert.ok("donnees" in b.zones && Array.isArray(b.zones.mois));
    assert.ok("donnees" in b.editions && Array.isArray(b.editions.editions));
    for (const e of b.editions.editions) {
      assert.ok(e.dateDebut === null || /^\d{4}-\d{2}-\d{2}$/.test(e.dateDebut), "dateDebut YYYY-MM-DD ou null");
      assert.ok(e.dateFin === null || /^\d{4}-\d{2}-\d{2}$/.test(e.dateFin), "dateFin YYYY-MM-DD ou null");
    }
    const brut = JSON.stringify(b);
    assert.ok(!/hash|motDePasse|secret|umpj_session/i.test(brut), "aucune donnee sensible");
  }
});

test("resume : ADMIN et LECTEUR autorisés — 200, 3 sections, aucune donnée sensible", opts, async () => {
  for (const [role, cookie] of [["ADMIN", cookieAdmin], ["LECTEUR", cookieLecteur]]) {
    const r = await get("/api/banque/resume?du=2026-02-01&au=2026-02-28", cookie);
    assert.equal(r.status, 200, `resume ${role}`);
    const b = await r.json();
    assert.deepEqual(b.periode, { du: "2026-02-01", au: "2026-02-28" });
    assert.equal("totalGeneral" in b, false, "jamais de total general inter-modules");
    for (const section of ["maisons", "zones", "editions"]) {
      const s = b[section];
      assert.ok(s, `${section} presente`);
      for (const cle of ["nbTotal", "nbRetenues", "agregat", "anomaliesDisponibles", "anomaliesPeriode", "nonEvaluables"]) {
        assert.ok(cle in s, `${section}.${cle} presente`);
      }
      assert.ok(Array.isArray(s.anomaliesDisponibles));
      assert.ok(Array.isArray(s.anomaliesPeriode));
      assert.ok(Array.isArray(s.nonEvaluables));
      for (const a of s.anomaliesDisponibles) {
        assert.ok(a.source && a.code && a.reference !== undefined && a.detail !== undefined);
      }
    }
    const brut = JSON.stringify(b);
    assert.ok(!/hash|motDePasse|secret|umpj_session/i.test(brut), "aucune donnee sensible");
  }
});

test("resume : contrats 400 (absente, inversée, illisible)", opts, async () => {
  const cas = [
    ["?au=2026-02-28", "du et au sont requis."],
    ["?du=2026-02-01", "du et au sont requis."],
    ["?du=2026-02-28&au=2026-02-01", "Période invalide : bornes illisibles, non calendaires ou du > au."],
    ["?du=abc&au=2026-02-28", "Période invalide : bornes illisibles, non calendaires ou du > au."],
  ];
  for (const [qs, message] of cas) {
    const r = await get(`/api/banque/resume${qs}`, cookieAdmin);
    assert.equal(r.status, 400, `400 sur ${qs}`);
    const b = await r.json();
    assert.deepEqual(b, { error: message }, `message exact sur ${qs}`);
  }
});

test("resume : saisie JJ/MM/AAAA acceptée (normaliserPeriode)", opts, async () => {
  const r = await get("/api/banque/resume?du=01/02/2026&au=28/02/2026", cookieLecteur);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.periode, { du: "2026-02-01", au: "2026-02-28" });
});
