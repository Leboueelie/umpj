// Tests HTTP de la caisse Fiches — base LOCALE ISOLÉE uniquement.
// Aucune connexion Neon : garde anti-production sur FICHES_CAISSE_TEST_DATABASE_URL.
//
// Par défaut (`npm test`) : ignorés (aucun serveur requis).
// Exécution documentée :
//   FICHES_CAISSE_TEST_DATABASE_URL=postgres://postgres:localtest@127.0.0.1:5435/<base_isolee> \
//   FICHES_E2E_URL=http://127.0.0.1:3001 \
//   FICHES_E2E_COOKIE_ADMIN='umpj_session=...' \
//   FICHES_E2E_COOKIE_LECTEUR='umpj_session=...' \
//   node --test tests/fiches-caisse-http.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { estUrlTestLocale } from "./helpers/garde-test.mjs";

const URL_DB = process.env.FICHES_CAISSE_TEST_DATABASE_URL ?? "";
const BASE = process.env.FICHES_E2E_URL ?? "";
const ADMIN = process.env.FICHES_E2E_COOKIE_ADMIN ?? "";
const LECTEUR = process.env.FICHES_E2E_COOKIE_LECTEUR ?? "";
const LOCALE = URL_DB !== "" && estUrlTestLocale(URL_DB);
const ACTIF = Boolean(BASE && ADMIN && LECTEUR && LOCALE);
const opts = {
  skip: ACTIF
    ? false
    : "FICHES_CAISSE_TEST_DATABASE_URL (locale), FICHES_E2E_URL et cookies requis",
};

let pool = null;
const stamp = Date.now();

function garde() {
  assert.ok(LOCALE, "La base de test doit être LOCALE (jamais Neon/production)");
}

async function call(method, path, body, cookie = ADMIN) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
}

const solde = async () => (await call("GET", "/api/fiches/caisse")).data.soldeDisponible;

async function nettoyer() {
  garde();
  const { Pool } = await import("pg");
  if (!pool) pool = new Pool({ connectionString: URL_DB });
  await pool.query('DELETE FROM "VenteFiche"');
  await pool.query('DELETE FROM "ProductionFiche"');
  await pool.query('DELETE FROM "DepenseFiche"');
  await pool.query('DELETE FROM "ProduitFiche"');
}

before(async () => { if (ACTIF) await nettoyer(); });
after(async () => { if (pool) await pool.end(); });

async function nouveauProduit(nom, prix) {
  const r = await call("POST", "/api/fiches/produits", { nom, prixUnitaire: prix, quantiteCible: 0 });
  assert.equal(r.status, 201);
  return r.data;
}
const vente = (p, montant, date, vendeur = "Claire") => ({
  produitId: p.id,
  quantite: String(Math.max(1, montant / p.prixUnitaire)),
  prixUnitaire: String(p.prixUnitaire),
  dateVente: date,
  vendeur,
});
const depense = (motif, montant, date, categorie = "papier") => ({
  motif, montant: String(montant), dateDepense: date, responsable: "Elie", categorie,
});

test("autorisations : anonyme et LECTEUR refusés, ADMIN accepté", opts, async () => {
  garde();
  const anon = await fetch(`${BASE}/api/fiches/caisse`);
  assert.equal(anon.status, 401);
  const lect = await call("GET", "/api/fiches/caisse", undefined, LECTEUR);
  assert.equal(lect.status, 403); // session valide mais rôle LECTEUR insuffisant
  const admin = await call("GET", "/api/fiches/caisse");
  assert.equal(admin.status, 200);
  assert.deepEqual(Object.keys(admin.data).sort(), [
    "dernieresDepenses", "soldeDisponible", "totalDepenses", "totalVentes",
  ]);
});

test(" création, solde et refus de dépense supérieure", opts, async () => {
  garde();
  await nettoyer();
  const p = await nouveauProduit(`Caisse HTTP ${stamp}`, 25);
  assert.equal(await solde(), 0);

  const v = await call("POST", "/api/fiches/ventes", vente(p, 25000, "2026-01-01"));
  assert.equal(v.status, 201);
  assert.equal(v.data.montant, 25000);
  assert.equal(await solde(), 25000);

  const d = await call("POST", "/api/fiches/depenses", depense("Impression", 5000, "2026-01-02"));
  assert.equal(d.status, 201);
  assert.equal(await solde(), 20000);

  const refus = await call("POST", "/api/fiches/depenses", depense("Papier", 20001, "2026-01-03"));
  assert.equal(refus.status, 409);
  assert.equal(await solde(), 20000);
  globalThis.__d1 = d.data.id;
});

test("modification et suppression d'une dépense avec recalcul", opts, async () => {
  garde();
  const id = globalThis.__d1;
  let r = await call("PUT", `/api/fiches/depenses/${id}`, depense("Impression", 8000, "2026-01-02"));
  assert.equal(r.status, 200);
  assert.equal(await solde(), 17000);

  r = await call("PUT", `/api/fiches/depenses/${id}`, depense("Impression", 30000, "2026-01-02"));
  assert.equal(r.status, 409);
  assert.equal(await solde(), 17000);

  r = await call("DELETE", `/api/fiches/depenses/${id}`);
  assert.equal(r.status, 200);
  assert.equal(await solde(), 25000);
});

test("vente déjà consommée : correction et suppression refusées", opts, async () => {
  garde();
  const ventes = (await call("GET", "/api/fiches/ventes")).data;
  const v = ventes[0];
  assert.ok(v);
  const d = await call("POST", "/api/fiches/depenses", depense("Transport", 25000, "2026-01-04", "transport"));
  assert.equal(d.status, 201);
  assert.equal(await solde(), 0);

  const modif = await call("PUT", `/api/fiches/ventes/${v.id}`, {
    produitId: v.produitId, quantite: "1", prixUnitaire: String(v.prixUnitaire),
    dateVente: "2026-01-01", vendeur: v.vendeur,
  });
  assert.equal(modif.status, 409);
  const sup = await call("DELETE", `/api/fiches/ventes/${v.id}`);
  assert.equal(sup.status, 409);
  assert.equal(await solde(), 0);
});

test("deux dépenses simultanées : aucune double consommation", opts, async () => {
  garde();
  for (const d of (await call("GET", "/api/fiches/depenses")).data) {
    await call("DELETE", `/api/fiches/depenses/${d.id}`);
  }
  for (const v of (await call("GET", "/api/fiches/ventes")).data) {
    await call("DELETE", `/api/fiches/ventes/${v.id}`);
  }
  const p = (await call("GET", "/api/fiches/produits")).data[0];
  assert.ok(p);
  const v = await call("POST", "/api/fiches/ventes", vente(p, 10000, "2026-02-01"));
  assert.equal(v.status, 201);
  assert.equal(await solde(), 10000);

  const [a, b] = await Promise.all([
    call("POST", "/api/fiches/depenses", depense("Concurrente A", 6000, "2026-02-02")),
    call("POST", "/api/fiches/depenses", depense("Concurrente B", 6000, "2026-02-02")),
  ]);
  const statuts = [a.status, b.status].sort();
  assert.deepEqual(statuts, [201, 409]);
  assert.equal(await solde(), 4000);
});

test("historique filtré : le solde après opération reste celui de l'ensemble (A1)", opts, async () => {
  garde();
  await nettoyer();
  const p = await nouveauProduit(`Caisse A1 ${stamp}`, 25);
  assert.equal((await call("POST", "/api/fiches/ventes", vente(p, 100, "2026-03-01"))).status, 201);
  assert.equal((await call("POST", "/api/fiches/depenses", depense("Papier", 40, "2026-03-02"))).status, 201);

  const plein = (await call("GET", "/api/fiches/caisse/historique")).data;
  const ventePlein = plein.find((m) => m.type === "vente");
  assert.equal(ventePlein.soldeApres, 60);

  for (const query of [
    "?type=vente",
    "?type=depense",
    "?du=2026-03-01&au=2026-03-31",
    "?type=vente&du=2026-03-01&au=2026-03-31&q=Claire",
  ]) {
    const h = (await call("GET", `/api/fiches/caisse/historique${query}`)).data;
    const v = h.find((m) => m.type === "vente");
    if (v) assert.equal(v.soldeApres, 60, `solde modifié par le filtre ${query}`);
  }
});

test("cohérence base de données : sommes SQL = solde API", opts, async () => {
  garde();
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: URL_DB });
  try {
    const v = await p.query('SELECT COALESCE(SUM(montant), 0)::bigint AS t FROM "VenteFiche"');
    const d = await p.query('SELECT COALESCE(SUM(montant), 0)::bigint AS t FROM "DepenseFiche"');
    const attendu = Number(v.rows[0].t) - Number(d.rows[0].t);
    assert.equal(await solde(), attendu);
  } finally { await p.end(); }
});
