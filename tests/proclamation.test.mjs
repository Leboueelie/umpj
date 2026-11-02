// Tests de robustesse de l'API Proclamation (mission FONCTIONNALITÉS-21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = "app/api/proclamation/route.ts";

test("proclamation : parsing multipart sécurisé", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("lireBufferBorne"), "lireBufferBorne utilisé");
  assert.ok(src.includes("if (bodyBuffer === null)"), "limite de taille vérifiée");
});

test("proclamation : validation type (comite ou region)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('type !== "comite" && type !== "region"'), "validation type");
  assert.ok(src.includes('"Type invalide (comite ou region)."'), "message d'erreur");
});

test("proclamation : validation comite longueur (150)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("comite.length > 150"), "limite comite");
});

test("proclamation : validation type longueur (50)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("type.length > 50"), "limite type");
});

test("proclamation : validation MIME type PDF", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('file.type !== "application/pdf"'), "validation MIME");
});

test("proclamation : validation taille fichier (10 Mo)", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("file.size > MAX_SIZE"), "validation taille");
});

test("proclamation : vérification magic bytes PDF", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("estPdf(buffer)"), "vérification magic bytes");
});

test("proclamation : DELETE retourne 404 si inexistant", () => {
  const src = readFileSync("app/api/proclamation/[id]/route.ts", "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Fichier introuvable."'), "message 404");
});

test("proclamation : download retourne 404 si inexistant", () => {
  const src = readFileSync("app/api/proclamation/[id]/download/route.ts", "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "vérification rowCount");
  assert.ok(src.includes('"Fichier introuvable."'), "message 404");
});

test("proclamation : Content-Disposition sécurisé", () => {
  const src = readFileSync("app/api/proclamation/[id]/download/route.ts", "utf8");
  assert.ok(src.includes("enteteContentDisposition"), "enteteContentDisposition utilisé");
});
