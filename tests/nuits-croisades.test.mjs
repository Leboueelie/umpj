// Tests ciblés — Nuits de prière et croisades + fonctions pures calc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeDate, normalizeHeure, tempsMisMin, parseDureeMinutes } from "../lib/calc.ts";

const N = "app/api/nuits-priere/route.ts";
const C = "app/api/croisade/route.ts";
const CID = "app/api/croisade/[id]/route.ts";

test("nuits : GET/POST/DELETE exposés", () => {
  const src = readFileSync(N, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
  assert.match(src, /export async function DELETE/);
});

test("nuits POST : parsing JSON sûr", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("nuits POST : champs requis → 400", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("if (!categorie || !date || !heureDebut || !heureFin || !participants)"), "validation champs requis");
  assert.ok(src.includes('"Tous les champs sont requis"'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("nuits POST : catégorie 'autre' requiert nomCategorie", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes('if (categorie === "autre" && !nomCategorie?.trim())'), "validation catégorie autre");
  assert.ok(src.includes('"Le nom de la catégorie est requis pour \'autre\'"'), "message d'erreur");
});

test("nuits POST : normalisation date/heure et durée", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("normalizeDate(date)"), "normalizeDate");
  assert.ok(src.includes("normalizeHeure(heureDebut)"), "normalizeHeure début");
  assert.ok(src.includes("normalizeHeure(heureFin)"), "normalizeHeure fin");
  assert.ok(src.includes("tempsMisMin(normalizedHeureDebut, normalizedHeureFin)"), "tempsMisMin");
  assert.ok(src.includes("tempsMis === null"), "gestion durée nulle");
});

test("nuits POST : formats invalides → 400", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes('"Format de date invalide"'), "message date invalide");
  assert.ok(src.includes('"Format d\'heure invalide"'), "message heure invalide");
  assert.ok(src.includes('"Impossible de calculer la durée"'), "message durée");
});

test("nuits POST : retourne 201", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201");
});

test("nuits DELETE : id requis → 400", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes('searchParams.get("id")'), "id lu");
  assert.ok(src.includes("if (!id)"), "validation id");
  assert.ok(src.includes('"ID requis"'), "message d'erreur");
});

test("nuits : filtres GET (categorie/dateDebut/dateFin)", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes('searchParams.get("categorie")'), "filtre categorie");
  assert.ok(src.includes('searchParams.get("dateDebut")'), "filtre dateDebut");
  assert.ok(src.includes('searchParams.get("dateFin")'), "filtre dateFin");
});

test("croisade : GET/POST exposés", () => {
  const src = readFileSync(C, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
});

test("croisade POST : parsing JSON sûr", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("croisade POST : champs requis → 400", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("if (!orateur?.trim() || !coordinateur?.trim() || !date || !heureDebut || !heureFin)"), "validation champs requis");
  assert.ok(src.includes('"Date, heures, orateur et coordinateur sont requis."'), "message d'erreur");
});

test("croisade POST : date/heure invalides → 400", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes('"Format de date invalide."'), "message date");
  assert.ok(src.includes('"Format d\'heure invalide."'), "message heure");
  assert.ok(src.includes('"Durée invalide."'), "message durée");
});

test("croisade POST : tempsMis > 0", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("tempsMis === null || tempsMis <= 0"), "validation durée > 0");
});

test("nuits POST : participants entier >= 1", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("if (!Number.isInteger(participants) || participants < 1)"), "validation participants");
  assert.ok(src.includes('"Le nombre de participants doit être un entier ≥ 1."'), "message d'erreur");
});

test("nuits POST : durée strictement positive", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("if (tempsMis <= 0)"), "validation durée > 0");
  assert.ok(src.includes('"La durée doit être strictement positive."'), "message d'erreur");
});

test("croisade POST : effectif total strictement positif", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("if (effectif <= 0)"), "validation effectif > 0");
  assert.ok(src.includes('"L\'effectif total doit être strictement positif."'), "message d'erreur");
});

test("nuits DELETE : 404 si inexistant", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Nuit introuvable."'), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("nuits POST : limite de longueur nomCategorie (100)", () => {
  const src = readFileSync(N, "utf8");
  assert.ok(src.includes("nomCategorie.trim().length > 100"), "limite nomCategorie");
  assert.ok(src.includes('"Le nom de la catégorie est trop long (100 caractères maximum)."'), "message d'erreur");
});

test("croisade POST : limite de longueur orateur (200)", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("orateur.trim().length > 200"), "limite orateur");
  assert.ok(src.includes('"L\'orateur est trop long (200 caractères maximum)."'), "message d'erreur");
});

test("croisade POST : limite de longueur coordinateur (200)", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("coordinateur.trim().length > 200"), "limite coordinateur");
  assert.ok(src.includes('"Le coordinateur est trop long (200 caractères maximum)."'), "message d'erreur");
});

test("croisade POST : rôles validés (entiers >= 0)", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("ROLES"), "constante ROLES");
  assert.ok(src.includes("Number.isInteger(v) || v < 0"), "validation entier >= 0");
  assert.ok(src.includes("doit être un entier ≥ 0."), "message d'erreur");
});

test("croisade POST : retourne 201", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201");
});

test("croisade [id] DELETE : 404 si introuvable", () => {
  const src = readFileSync(CID, "utf8");
  assert.ok(src.includes("Enregistrement introuvable."), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("croisade : pas de req.json() brut", () => {
  const src = readFileSync(C, "utf8");
  assert.ok(!src.includes("req.json()"), "pas de req.json() brut");
});

// ---- Fonctions pures : calc ----

test("normalizeHeure : formats variés", () => {
  assert.equal(normalizeHeure("8h30"), "08:30");
  assert.equal(normalizeHeure("20:15"), "20:15");
  assert.equal(normalizeHeure("830"), "08:30");
  assert.equal(normalizeHeure("8"), "08:00");
  assert.equal(normalizeHeure("8h"), "08:00");
});

test("normalizeHeure : invalide → null", () => {
  assert.equal(normalizeHeure("24:00"), null);
  assert.equal(normalizeHeure("12:60"), null);
  assert.equal(normalizeHeure("abc"), null);
  assert.equal(normalizeHeure(null), null);
  assert.equal(normalizeHeure(""), null);
});

test("tempsMisMin : passage minuit (+1440)", () => {
  assert.equal(tempsMisMin("23:00", "01:00"), 120);
  assert.equal(tempsMisMin("08:00", "09:30"), 90);
  assert.equal(tempsMisMin("10:00", "10:00"), 0);
});

test("tempsMisMin : invalide → null", () => {
  assert.equal(tempsMisMin("xx", "09:00"), null);
  assert.equal(tempsMisMin("08:00", null), null);
});

test("parseDureeMinutes : formats", () => {
  assert.equal(parseDureeMinutes("1:30"), 90);
  assert.equal(parseDureeMinutes("2h15"), 135);
  assert.equal(parseDureeMinutes("45"), 45);
  assert.equal(parseDureeMinutes("1:60"), null);
});

test("parseDureeMinutes : null/vide → null", () => {
  assert.equal(parseDureeMinutes(null), null);
  assert.equal(parseDureeMinutes(""), null);
  assert.equal(parseDureeMinutes("   "), null);
});

test("normalizeDate : formats supplémentaires", () => {
  assert.equal(normalizeDate("2025-08-25"), "2025-08-25");
  assert.equal(normalizeDate("25/08/2025"), "2025-08-25");
  assert.equal(normalizeDate("25082025"), "2025-08-25");
  assert.equal(normalizeDate("250825"), "2025-08-25");
});
