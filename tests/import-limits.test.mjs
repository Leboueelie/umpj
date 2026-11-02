// Tests purs des limites d'import JSON (AUD-003.2).
// Aucune connexion réseau, aucune base, aucun serveur.
// Exécution : `node --test tests/import-limits.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validerImportCahiers,
  validerImportZones,
  MAX_CAHIER_COUNT,
  MAX_LIGNES_PER_CAHIER,
  MAX_LIGNES_TOTAL,
  MAX_ZONE_ENTRIES,
  MAX_NOM_LENGTH,
  MAX_ZONE_NAME_LENGTH,
} from "../lib/import-limits.ts";

// ---- validerImportCahiers ----

test("import cahiers : tableau vide → rejeté", () => {
  const r = validerImportCahiers([]);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Aucun cahier/);
});

test("import cahiers : non-tableau → rejeté", () => {
  assert.equal(validerImportCahiers("abc").ok, false);
  assert.equal(validerImportCahiers(42).ok, false);
  assert.equal(validerImportCahiers(null).ok, false);
  assert.equal(validerImportCahiers({}).ok, false);
});

test("import cahiers : import valide → accepté", () => {
  const cahiers = [
    { nom: "Cahier 1", lignes: [{ date: "2025-01-01", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 5 }] },
    { nom: "Cahier 2", lignes: [] },
  ];
  assert.equal(validerImportCahiers(cahiers).ok, true);
});

test("import cahiers : plafond exact accepté (100 cahiers)", () => {
  const cahiers = Array.from({ length: MAX_CAHIER_COUNT }, (_, i) => ({
    nom: `Cahier ${i + 1}`,
    lignes: [],
  }));
  assert.equal(validerImportCahiers(cahiers).ok, true);
});

test("import cahiers : plafond dépassé rejeté (101 cahiers)", () => {
  const cahiers = Array.from({ length: MAX_CAHIER_COUNT + 1 }, (_, i) => ({
    nom: `Cahier ${i + 1}`,
    lignes: [],
  }));
  const r = validerImportCahiers(cahiers);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Maximum 100 cahiers/);
});

test("import cahiers : plafond lignes par cahier accepté (5000)", () => {
  const cahiers = [{ nom: "Cahier 1", lignes: Array.from({ length: MAX_LIGNES_PER_CAHIER }, () => ({})) }];
  assert.equal(validerImportCahiers(cahiers).ok, true);
});

test("import cahiers : plafond lignes par cahier dépassé (5001)", () => {
  const cahiers = [{ nom: "Cahier 1", lignes: Array.from({ length: MAX_LIGNES_PER_CAHIER + 1 }, () => ({})) }];
  const r = validerImportCahiers(cahiers);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Maximum 5000 lignes par cahier/);
});

test("import cahiers : plafond total lignes dépassé (100001)", () => {
  // 21 cahiers × 5000 lignes = 105000 > 100000
  const cahiers = Array.from({ length: 21 }, (_, i) => ({
    nom: `Cahier ${i + 1}`,
    lignes: Array.from({ length: 5000 }, () => ({})),
  }));
  const r = validerImportCahiers(cahiers);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Maximum 100000 lignes au total/);
});

test("import cahiers : champ texte trop long (nom > 200)", () => {
  const cahiers = [{ nom: "A".repeat(MAX_NOM_LENGTH + 1), lignes: [] }];
  const r = validerImportCahiers(cahiers);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Nom de cahier trop long/);
});

test("import cahiers : cahier non-objet → rejeté", () => {
  const r = validerImportCahiers([42, "abc", null]);
  assert.equal(r.ok, false);
});

test("import cahiers : lignes non-tableau → rejeté", () => {
  const r = validerImportCahiers([{ nom: "Cahier 1", lignes: "pas un tableau" }]);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /tableau/);
});

test("import cahiers : nom de mauvais type (objet) → rejeté", () => {
  const r = validerImportCahiers([{ nom: { foo: "bar" }, lignes: [] }]);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /chaîne/);
});

// ---- validerImportZones ----

test("import zones : mois et lignes valides → accepté", () => {
  const r = validerImportZones("2025-01", [{ zone: "COCODY", participants: 10, tempsMis: "1h30" }]);
  assert.equal(r.ok, true);
});

test("import zones : mois invalide → rejeté", () => {
  const r = validerImportZones("2025-13", []);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /mois invalide/);
});

test("import zones : mois non-string → rejeté", () => {
  const r = validerImportZones(202501, []);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /chaîne/);
});

test("import zones : lignes non-tableau → rejeté", () => {
  const r = validerImportZones("2025-01", "pas un tableau");
  assert.equal(r.ok, false);
  assert.match(r.erreur, /tableau/);
});

test("import zones : plafond exact accepté (200 entrées)", () => {
  const lignes = Array.from({ length: MAX_ZONE_ENTRIES }, (_, i) => ({ zone: `Zone ${i + 1}` }));
  const r = validerImportZones("2025-01", lignes);
  assert.equal(r.ok, true);
});

test("import zones : plafond dépassé rejeté (201 entrées)", () => {
  const lignes = Array.from({ length: MAX_ZONE_ENTRIES + 1 }, (_, i) => ({ zone: `Zone ${i + 1}` }));
  const r = validerImportZones("2025-01", lignes);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Maximum 200 entrées/);
});

test("import zones : entrée non-objet → rejetée", () => {
  const r = validerImportZones("2025-01", [42, "abc", null]);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /objet/);
});

test("import zones : nom de zone trop long → rejeté", () => {
  const lignes = [{ zone: "A".repeat(MAX_ZONE_NAME_LENGTH + 1) }];
  const r = validerImportZones("2025-01", lignes);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Nom de zone trop long/);
});

test("import zones : lignes vides → accepté", () => {
  const r = validerImportZones("2025-01", []);
  assert.equal(r.ok, true);
});

test("import zones : entrée sans zone → accepté (zone vide ignorée par la route)", () => {
  const r = validerImportZones("2025-01", [{ participants: 5 }]);
  assert.equal(r.ok, true);
});