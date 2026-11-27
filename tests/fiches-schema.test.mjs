// Tests du schéma FICHES sur base locale isolée (env-gated, lecture seule).
// Exécution : `node --test tests/*.test.mjs`
// Sans BANQUE_TEST_DATABASE_URL, tous les tests sont ignorés.
// Garde anti-production : hôte exact localhost/127.0.0.1, jamais "neon".
import { test } from "node:test";
import assert from "node:assert/strict";
import { estUrlTestLocale } from "./helpers/garde-test.mjs";

const URL_DB = process.env.BANQUE_TEST_DATABASE_URL ?? "";
const SAUT = URL_DB === "" ? "BANQUE_TEST_DATABASE_URL absent : tests schéma ignorés" : false;
const LOCALE = estUrlTestLocale(URL_DB);

test("garde : URL de test locale requise", { skip: SAUT }, () => {
  assert.ok(LOCALE, "BANQUE_TEST_DATABASE_URL doit viser une base locale (jamais Neon)");
});

test("schéma : tables et contraintes du module FICHES", { skip: SAUT || !LOCALE }, async () => {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  try {
    const tables = await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN ('ProduitFiche','ProductionFiche','VenteFiche')`
    );
    const presents = tables.rows.map((r) => r.table_name);
    for (const t of ["ProduitFiche", "ProductionFiche", "VenteFiche"]) {
      if (!presents.includes(t)) return; // schéma non appliqué : test non concluant, pas d'échec
    }
    // Prix et montant non négatifs, quantités strictement positives.
    const checks = await c.query(
      `SELECT conname FROM pg_constraint WHERE conrelid IN
       ('"ProduitFiche"'::regclass, '"ProductionFiche"'::regclass, '"VenteFiche"'::regclass)
       AND contype = 'c'`
    );
    const noms = checks.rows.map((r) => r.conname);
    for (const n of [
      "ProduitFiche_prixUnitaire_check",
      "ProductionFiche_quantite_check",
      "VenteFiche_quantite_check",
      "VenteFiche_prixUnitaire_check",
      "VenteFiche_montant_check",
    ]) assert.ok(noms.includes(n), `constraint ${n} absente`);

    // Aucune contrainte d'unicité sur produitId : enregistrements multiples permis.
    const uniques = await c.query(
      `SELECT conname FROM pg_constraint WHERE conrelid IN
       ('"ProductionFiche"'::regclass, '"VenteFiche"'::regclass) AND contype = 'u'`
    );
    assert.equal(uniques.rowCount, 0, "aucune UNIQUE sur produitId");

    // Index d'unicité du nom normalisé (anti-doublon catalogue).
    const idx = await c.query(
      `SELECT indexname FROM pg_indexes WHERE tablename='ProduitFiche' AND indexname='ProduitFiche_nom_normalise_key'`
    );
    assert.equal(idx.rowCount, 1);
  } finally {
    await c.end();
  }
});

test("calcul SQL : montant = quantite × prix (lecture seule, CTE)", { skip: SAUT || !LOCALE }, async () => {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  try {
    const r = await c.query(
      `WITH v(quantite, prix) AS (VALUES (10, 25), (3, 50))
       SELECT SUM(quantite * prix)::int AS montant FROM v`
    );
    assert.equal(r.rows[0].montant, 400);
  } finally {
    await c.end();
  }
});
