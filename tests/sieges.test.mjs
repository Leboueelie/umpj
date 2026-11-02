// Tests ciblés — Sièges de prière (app/api/sieges-priere/*).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = "app/api/sieges-priere/route.ts";
const SID = "app/api/sieges-priere/[id]/route.ts";
const SED = "app/api/sieges-priere/editions/route.ts";

test("sieges : GET/POST exposés", () => {
  const src = readFileSync(S, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
});

test("sieges GET : filtre par edition valide → 400 si invalide", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes('searchParams.get("edition")'), "param edition lu");
  assert.ok(src.includes("Number.isInteger(edition) || edition < 1"), "validation edition");
  assert.ok(src.includes('"Numéro d\'édition invalide."'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("sieges GET : sans filtre → liste globale", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes('ORDER BY "date" DESC, "heureDebut"'), "tri global");
});

test("sieges POST : parsing JSON sûr", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("sieges POST : champs requis → 400", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("if (!nom?.trim() || !numeroEdition || jour == null || jour === \"\" || !orateur?.trim() || !date || !heureDebut || !heureFin || !participants)"), "validation champs requis");
  assert.ok(src.includes('"Tous les champs sont requis."'), "message d'erreur");
});

test("sieges POST : date/heure invalides → 400", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes('"Format de date invalide."'), "message date");
  assert.ok(src.includes('"Format d\'heure invalide."'), "message heure");
});

test("sieges POST : jour entier >= 1", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("if (!Number.isInteger(jour) || jour < 1)"), "validation jour");
  assert.ok(src.includes('"Le numéro de jour doit être un entier ≥ 1."'), "message d'erreur");
});

test("sieges POST : participants entier >= 1", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("if (!Number.isInteger(participants) || participants < 1)"), "validation participants");
  assert.ok(src.includes('"Le nombre de participants doit être un entier ≥ 1."'), "message d'erreur");
});

test("sieges POST : numeroEdition entier > 0", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("if (!Number.isInteger(numeroEdition) || numeroEdition <= 0)"), "validation numeroEdition");
});

test("sieges POST : durée valide > 0", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("tempsMis === null || tempsMis <= 0"), "validation durée");
  assert.ok(src.includes('"Durée invalide."'), "message d'erreur");
});

test("sieges POST : retourne 201", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201");
});

test("sieges [id] DELETE : 404 si introuvable", () => {
  const src = readFileSync(SID, "utf8");
  assert.ok(src.includes('"Siège introuvable."'), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("sieges editions : liste groupée par edition", () => {
  const src = readFileSync(SED, "utf8");
  assert.ok(src.includes('GROUP BY "numeroEdition"'), "group by edition");
  assert.ok(src.includes("count(*)::int"), "count");
  assert.ok(src.includes("NextResponse.json"), "réponse JSON");
});

test("sieges : pas de req.json() brut", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(!src.includes("req.json()"), "pas de req.json() brut");
});

test("sieges POST : limite de longueur nom (200)", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("nom.trim().length > 200"), "limite nom");
  assert.ok(src.includes('"Le nom est trop long (200 caractères maximum)."'), "message d'erreur");
});

test("sieges POST : limite de longueur orateur (200)", () => {
  const src = readFileSync(S, "utf8");
  assert.ok(src.includes("orateur.trim().length > 200"), "limite orateur");
  assert.ok(src.includes('"L\'orateur est trop long (200 caractères maximum)."'), "message d'erreur");
});
