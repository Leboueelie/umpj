// Tests purs de la validation de taille de corps (AUD-003.1b).
// Aucune connexion réseau, aucune base, aucun serveur.
// Exécution : `node --test tests/body-limit.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { validerTailleDeclaree } from "../lib/body-limit-core.ts";

const LIMITE = 5 * 1024 * 1024; // 5 Mo

test("taille : en-tête absent (null) → accepté", () => {
  assert.deepEqual(validerTailleDeclaree(null, LIMITE), { ok: true });
});

test("taille : chaîne vide → 400 (malformé)", () => {
  const r = validerTailleDeclaree("", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : zéro → accepté", () => {
  assert.deepEqual(validerTailleDeclaree("0", LIMITE), { ok: true });
});

test("taille : limite exacte → accepté", () => {
  assert.deepEqual(validerTailleDeclaree(String(LIMITE), LIMITE), { ok: true });
});

test("taille : limite + 1 → 413", () => {
  const r = validerTailleDeclaree(String(LIMITE + 1), LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test("taille : chaîne non numérique → 400", () => {
  const r = validerTailleDeclaree("abc", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : valeur négative → 400", () => {
  const r = validerTailleDeclaree("-5", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : signe positif → 400", () => {
  const r = validerTailleDeclaree("+100", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : espaces → 400", () => {
  const r = validerTailleDeclaree("  100  ", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : virgule → 400", () => {
  const r = validerTailleDeclaree("100,000", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : notation scientifique → 400", () => {
  const r = validerTailleDeclaree("1e5", LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : valeur supérieure à Number.MAX_SAFE_INTEGER → 400", () => {
  const r = validerTailleDeclaree(String(Number.MAX_SAFE_INTEGER + 1), LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : valeur très grande → 400", () => {
  const r = validerTailleDeclaree("9".repeat(100), LIMITE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("taille : valeur valide sous la limite → accepté", () => {
  assert.deepEqual(validerTailleDeclaree("100", LIMITE), { ok: true });
});

test("taille : valeur valide avec zéros initiaux → accepté (chiffres ASCII)", () => {
  // "0100" est composé de chiffres ASCII → accepté (parseInt donne 100)
  // Note : zéros initiaux sont acceptés car le regex /^\d+$/ les permet.
  // C'est un choix conservateur : on ne rejette pas les en-têtes trivialement malformés.
  assert.deepEqual(validerTailleDeclaree("0100", LIMITE), { ok: true });
});