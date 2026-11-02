// Tests ciblés — Équipes de prière et sujets (app/api/equipes-priere/*, app/api/sujets-priere/*).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SUJ = "app/api/sujets-priere/route.ts";
const EQ = "app/api/equipes-priere/route.ts";

test("sujets : GET/POST/DELETE exposés", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
  assert.match(src, /export async function DELETE/);
});

test("sujets POST : parsing JSON sûr", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("sujets POST : nom requis, trim", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes("if (!nom?.trim())"), "validation nom");
  assert.ok(src.includes('"Le nom du sujet est requis"'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
  assert.ok(src.includes("nom.trim()"), "trim à l'insertion");
});

test("sujets POST : retourne 201", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201");
});

test("sujets POST : id généré via randomUUID", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes("randomUUID()"), "id généré");
});

test("sujets DELETE : id requis (query) → 400", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes('searchParams.get("id")'), "id lu depuis la query");
  assert.ok(src.includes("if (!id)"), "validation id");
  assert.ok(src.includes('"ID requis"'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("sujets : pas de req.json() brut", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(!src.includes("req.json()"), "pas de req.json() brut");
});

test("equipes : GET/POST/DELETE exposés", () => {
  const src = readFileSync(EQ, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
  assert.match(src, /export async function DELETE/);
});

test("equipes GET : sujetId requis → 400", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes('searchParams.get("sujetId")'), "sujetId lu");
  assert.ok(src.includes("if (!sujetId)"), "validation sujetId");
  assert.ok(src.includes('"sujetId requis"'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("equipes POST : parsing JSON sûr", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("equipes POST : tous les champs requis → 400", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("if (!sujetId || !zone?.trim() || !dateDebut || !dateFin || tempsMis == null || !nombrePersonnes)"), "validation champs requis");
  assert.ok(src.includes('"Tous les champs sont requis"'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("equipes POST : destructuration des 6 champs", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("const { sujetId, zone, dateDebut, dateFin, tempsMis, nombrePersonnes } = body;"), "champs extraits");
});

test("equipes POST : tempsMis entier > 0", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("if (!Number.isInteger(tempsMis) || tempsMis <= 0)"), "validation tempsMis");
  assert.ok(src.includes('"Le temps mis doit être un entier supérieur à 0."'), "message d'erreur");
});

test("equipes POST : nombrePersonnes entier >= 1", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("if (!Number.isInteger(nombrePersonnes) || nombrePersonnes < 1)"), "validation nombrePersonnes");
  assert.ok(src.includes('"Le nombre de personnes doit être un entier ≥ 1."'), "message d'erreur");
});

test("sujets POST : limite de longueur du nom (200)", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes("nom.trim().length > 200"), "limite nom");
  assert.ok(src.includes('"Le nom du sujet est trop long (200 caractères maximum)."'), "message d'erreur");
});

test("equipes POST : limite de longueur de la zone (150)", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("zone.trim().length > 150"), "limite zone");
  assert.ok(src.includes('"La zone est trop longue (150 caractères maximum)."'), "message d'erreur");
});

test("equipes POST : vérification existence sujet", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes('SELECT 1 FROM "SujetPriere" WHERE id = $1'), "vérification existence");
  assert.ok(src.includes('"Sujet introuvable."'), "message 404");
});

test("sujets DELETE : 404 si inexistant", () => {
  const src = readFileSync(SUJ, "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Sujet introuvable."'), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("equipes DELETE : 404 si inexistant", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Équipe introuvable."'), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("equipes POST : trim de zone", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("zone.trim()"), "trim de zone");
});

test("equipes POST : retourne 201", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201");
});

test("equipes DELETE : id requis → 400", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes('searchParams.get("id")'), "id lu");
  assert.ok(src.includes("if (!id)"), "validation id");
  assert.ok(src.includes('"ID requis"'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("equipes : pas de req.json() brut", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(!src.includes("req.json()"), "pas de req.json() brut");
});

test("equipes : réponses JSON cohérentes", () => {
  const src = readFileSync(EQ, "utf8");
  assert.ok(src.includes("NextResponse.json"), "NextResponse.json utilisé");
});
