// Tests de normalisation des noms complets (mission FRONT-39).
// Exécution : node --test tests/normalisation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserNom } from "../lib/normalisation.ts";

test("normaliserNom : trim + collapse espaces + minuscules", () => {
  assert.equal(normaliserNom("  Yao Divine  "), "yao divine");
  assert.equal(normaliserNom("Yao   Divine"), "yao divine");
  assert.equal(normaliserNom("Kouassi Jean Marc"), "kouassi jean marc");
  assert.equal(normaliserNom("Elie"), "elie");
});

test("normaliserNom : casse", () => {
  assert.equal(normaliserNom("YAO DIVINE"), "yao divine");
  assert.equal(normaliserNom("yAo DiViNe"), "yao divine");
});

test("normaliserNom : accents conservés", () => {
  assert.equal(normaliserNom("Élie"), "élie");
  assert.equal(normaliserNom("  ÉLIE  "), "élie");
  // accents distinctifs : Élie ≠ Elie
  assert.notEqual(normaliserNom("Élie"), normaliserNom("Elie"));
});

test("normaliserNom : entrées invalides", () => {
  assert.equal(normaliserNom(""), "");
  assert.equal(normaliserNom("   "), "");
  assert.equal(normaliserNom(null), "");
  assert.equal(normaliserNom(undefined), "");
});

test("normaliserNom : équivalences", () => {
  // Les quatre variantes doivent être équivalentes
  const variants = ["Yao Divine", "yao divine", " Yao Divine ", "Yao   Divine"];
  const norm = variants.map(normaliserNom);
  assert.ok(norm.every((n) => n === norm[0]));
});