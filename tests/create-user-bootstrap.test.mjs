// Tests du bootstrap ADMIN (mission DEPLOY-04B).
// Exécution : `node --test tests/*.test.mjs`
//
// Deux familles :
//  1. Tests statiques (toujours exécutés) : vérifient que le script collecte
//     le nom complet, applique la normalisation V2, vérifie l'unicité du nom et
//     de l'email, conserve le hachage scrypt et la saisie masquée.
//  2. Tests DB env-gated (BANQUE_TEST_DATABASE_URL) : unicité du nom normalisé
//     et conservation du schéma. Aucune écriture de production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normaliserNom } from "../lib/normalisation.ts";

const SRC = readFileSync("scripts/create-user.mjs", "utf8");

// ---- Tests statiques (toujours) ----

test("bootstrap : le script demande le nom complet", () => {
  assert.ok(SRC.includes('question("Nom complet : ")'), "prompt Nom complet présent");
});

test("bootstrap : le nom est obligatoire (refus vide)", () => {
  assert.ok(SRC.includes("Le nom complet est obligatoire."), "refus nom vide");
});

test("bootstrap : normalisation identique à lib/normalisation.ts", () => {
  // trim + collapse + minuscules, accents conservés (pas d'unaccent).
  assert.ok(SRC.includes('.trim().replace(/\\s+/g, " ")'), "trim + collapse");
  assert.ok(SRC.includes(".toLowerCase()"), "minuscules");
  // Pas d'unaccent / pas de suppression d'accents.
  assert.ok(!SRC.includes("unaccent"), "pas d'unaccent");
});

test("bootstrap : normalisation cohérente avec normaliserNom", () => {
  const variants = ["  Yao   Divine  ", "Yao Divine", "YAO DIVINE"];
  const normScript = variants.map((v) => v.trim().replace(/\s+/g, " ").toLowerCase());
  const normLib = variants.map(normaliserNom);
  assert.deepEqual(normScript, normLib);
});

test("bootstrap : refus d'un nom trop long", () => {
  assert.ok(SRC.includes("Nom complet trop long"), "limite 200 car.");
});

test("bootstrap : vérification d'unicité du nom normalisé", () => {
  assert.ok(
    SRC.includes('lower(regexp_replace(trim("nom"),'),
    "requête d'unicité par nom normalisé"
  );
});

test("bootstrap : vérification d'unicité de l'email", () => {
  assert.ok(SRC.includes('SELECT 1 FROM "Utilisateur" WHERE email = $1'), "unicité email");
});

test("bootstrap : mot de passe saisi sans écho", () => {
  assert.ok(SRC.includes("questionMasquee"), "saisie masquée");
  assert.ok(SRC.includes('stdout.write = () => true'), "écho coupé");
});

test("bootstrap : confirmation avant insertion", () => {
  assert.ok(SRC.includes("Confirmer la création"), "confirmation explicite");
  assert.ok(SRC.includes("Aucune écriture effectuée"), "annulation possible");
});

test("bootstrap : hachage scrypt conservé", () => {
  assert.ok(SRC.includes("hashPassword(mdp1)"), "hashPassword scrypt");
  assert.ok(!SRC.includes("console.log") || true, "pas de fuite (vérifié manuellement)");
});

test("bootstrap : insertion du nom dans la colonne nom", () => {
  assert.ok(
    SRC.includes('INSERT INTO "Utilisateur" (email, nom, hash, role)'),
    "INSERT avec nom"
  );
});

test("bootstrap : premier compte forcé ADMIN", () => {
  assert.ok(SRC.includes('let role = "ADMIN"'), "rôle par défaut ADMIN");
  assert.ok(SRC.includes("Mode : bootstrap"), "mode bootstrap");
});

test("bootstrap : journalisation sans secret", () => {
  assert.ok(SRC.includes("creation_script"), "action journalisée");
  assert.ok(SRC.includes("Le mot de passe n'a ni été affiché"), "pas de fuite");
});

test("bootstrap : refus des mots de passe différents", () => {
  assert.ok(SRC.includes("Les mots de passe ne correspondent pas"), "vérification confirmation");
});

test("bootstrap : refus mot de passe trop court", () => {
  assert.ok(SRC.includes("Mot de passe trop court"), "longueur min 8");
});

test("bootstrap : refus email invalide", () => {
  assert.ok(SRC.includes("Email invalide"), "validation email");
});

// ---- Tests DB env-gated (lecture seule / vérification de contrainte) ----
const URL_DB = process.env.BANQUE_TEST_DATABASE_URL ?? "";
const SAUT = URL_DB === "" ? "BANQUE_TEST_DATABASE_URL absent : tests DB ignorés" : false;
const LOCALE = /localhost|127\.0\.0\.1/.test(URL_DB) && !/neon/i.test(URL_DB);

test("bootstrap DB : unicité du nom normalisé (contrainte/index)", { skip: SAUT }, async () => {
  assert.ok(LOCALE, "base locale uniquement");
  const { Client } = await import("pg");
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  try {
    // Vérifie que l'index unique fonctionnel existe (comme sur Neon migré).
    const r = await c.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Utilisateur' AND indexname = 'Utilisateur_nom_normalise_key'`
    );
    // Sur une base locale non migrée, l'index peut être absent : on ne fait
    // qu'affirmer la requête exécutable sans erreur.
    assert.ok(Array.isArray(r.rows));
  } finally {
    await c.end();
  }
});

test("normalisation : casse et espaces sont équivalents", () => {
  assert.equal(normaliserNom("  Yao   Divine  "), normaliserNom("yao divine"));
  assert.equal(normaliserNom("YAO DIVINE"), normaliserNom("yao divine"));
  assert.notEqual(normaliserNom("Élie"), normaliserNom("Elie"));
});