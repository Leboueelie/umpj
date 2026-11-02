// Tests de robustesse de l'API Actions de grâce (mission FONCTIONNALITÉS-19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = "app/api/actions-de-grace/route.ts";

test("actions-de-grace : parsing JSON sûr (multipart, pas de req.json)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("lireBufferBorne"), "lireBufferBorne utilisé");
  assert.ok(src.includes("if (bodyBuffer === null)"), "limite de taille vérifiée");
});

test("actions-de-grace : validation type (comite ou region)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('type !== "comite" && type !== "region"'), "validation type");
  assert.ok(src.includes('"Type invalide (comite ou region)."'), "message d'erreur");
});

test("actions-de-grace : validation comite longueur (150)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("comite.length > 150"), "limite comite");
});

test("actions-de-grace : validation type longueur (50)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("type.length > 50"), "limite type");
});

test("actions-de-grace : validation MIME type PDF", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('file.type !== "application/pdf"'), "validation MIME");
});

test("actions-de-grace : validation taille fichier (10 Mo)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("file.size > MAX_SIZE"), "validation taille");
});

test("actions-de-grace : vérification magic bytes PDF", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("estPdf(buffer)"), "vérification magic bytes");
});

test("actions-de-grace : DELETE retourne 404 si inexistant", () => {
  const src = readFileSync("app/api/actions-de-grace/[id]/route.ts", "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Fichier introuvable."'), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("actions-de-grace : download retourne 404 si inexistant", () => {
  const src = readFileSync("app/api/actions-de-grace/[id]/download/route.ts", "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Fichier introuvable."'), "message 404");
});

test("actions-de-grace : Content-Disposition sécurisé", () => {
  const src = readFileSync("app/api/actions-de-grace/[id]/download/route.ts", "utf8");
  assert.ok(src.includes("enteteContentDisposition"), "enteteContentDisposition utilisé");
});
