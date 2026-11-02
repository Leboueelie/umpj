// Tests de normalisation de dates (mission FIX-MÉTIER-02).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate } from "../lib/calc.ts";

test("normalizeDate : ISO valide", () => {
  assert.equal(normalizeDate("2025-08-25"), "2025-08-25");
  assert.equal(normalizeDate("2024-02-29"), "2024-02-29"); // bissextile
});

test("normalizeDate : date calendaire impossible → null", () => {
  assert.equal(normalizeDate("2025-04-31"), null); // avril = 30 jours
  assert.equal(normalizeDate("2025-02-29"), null); // 2025 non bissextile
  assert.equal(normalizeDate("2025-02-30"), null);
  assert.equal(normalizeDate("2025-13-01"), null); // mois 13
  assert.equal(normalizeDate("2025-00-10"), null); // mois 0
  assert.equal(normalizeDate("2025-01-00"), null); // jour 0
  assert.equal(normalizeDate("2025-01-32"), null); // jour 32
});

test("normalizeDate : formats JJ/MM/AAAA", () => {
  assert.equal(normalizeDate("25/08/2025"), "2025-08-25");
  assert.equal(normalizeDate("31/04/2026"), null); // avril = 30 jours
  assert.equal(normalizeDate("29/02/2025"), null); // non bissextile
  assert.equal(normalizeDate("29/02/2024"), "2024-02-29"); // bissextile
});

test("normalizeDate : formats 8 chiffres (JJMMAAAA)", () => {
  assert.equal(normalizeDate("25082025"), "2025-08-25");
  assert.equal(normalizeDate("31042026"), null); // avril = 30 jours
});

test("normalizeDate : valeurs nulles/vides", () => {
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate(undefined), null);
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("   "), null);
});

test("normalizeDate : formats invalides", () => {
  assert.equal(normalizeDate("pas-une-date"), null);
  assert.equal(normalizeDate("2025"), null);
  assert.equal(normalizeDate("2025-13"), null);
});
