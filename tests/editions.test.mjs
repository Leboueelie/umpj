// Tests ciblés — Éditions (app/api/editions/*) + fonctions pures fichiers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estPdf, nomFichierSur, enteteContentDisposition } from "../lib/fichiers.ts";

const E = "app/api/editions/route.ts";
const EID = "app/api/editions/[id]/route.ts";
const EPDF = "app/api/editions/[id]/pdf/route.ts";
const EIMP = "app/api/editions/import/route.ts";

test("editions : GET/POST exposés", () => {
  const src = readFileSync(E, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
});

test("editions POST : parsing JSON sûr", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("editions POST : champs requis → 400", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("if (!b.numero || !b.dateDebut || !b.dateFin)"), "validation champs requis");
  assert.ok(src.includes('"numero, dateDebut et dateFin sont requis."'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("editions POST : format de date AAAA-MM-JJ → 400", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/'), "regex format date");
  assert.ok(src.includes('"Format de date invalide (AAAA-MM-JJ)."'), "message format");
});

test("editions POST : date calendaire invalide → 400", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("validEditionDate"), "validation calendaire");
  assert.ok(src.includes('"Date invalide."'), "message date invalide");
});

test("editions POST : retourne 201 avec id", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201");
  assert.ok(src.includes('RETURNING "id"'), "retour id");
});

test("editions POST : gère l'erreur SQL → 500", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("status: 500"), "statut 500 sur erreur");
});

test("editions [id] : GET/PUT/DELETE exposés", () => {
  const src = readFileSync(EID, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function PUT/);
  assert.match(src, /export async function DELETE/);
});

test("editions [id] GET : 404 si introuvable", () => {
  const src = readFileSync(EID, "utf8");
  assert.ok(src.includes("Edition introuvable."), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("editions [id] PUT : parsing JSON sûr", () => {
  const src = readFileSync(EID, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("editions [id] PUT : format de date invalide → 400", () => {
  const src = readFileSync(EID, "utf8");
  assert.ok(src.includes("Format de date invalide (AAAA-MM-JJ)."), "message format");
  assert.ok(src.includes("validDate"), "validation calendaire");
});

test("editions [id] PUT : 404 si introuvable", () => {
  const src = readFileSync(EID, "utf8");
  assert.ok(src.includes("Edition introuvable."), "message 404");
  assert.ok(src.includes("if (!r.rowCount)"), "rowCount vérifié");
});

test("editions [id] DELETE : 404 si introuvable", () => {
  const src = readFileSync(EID, "utf8");
  // DELETE section
  const delIdx = src.indexOf("export async function DELETE");
  const del = src.slice(delIdx);
  assert.ok(del.includes("Edition introuvable."), "message 404");
  assert.ok(del.includes("status: 404"), "statut 404");
});

test("editions pdf : 404 si introuvable", () => {
  const src = readFileSync(EPDF, "utf8");
  assert.ok(src.includes("Edition introuvable."), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
  assert.ok(src.includes('Content-Type": "application/pdf"'), "content-type PDF");
});

test("editions import : fichier requis → 400", () => {
  const src = readFileSync(EIMP, "utf8");
  assert.ok(src.includes("Fichier requis (champ 'file')."), "message fichier requis");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("editions import : limite de taille → 413", () => {
  const src = readFileSync(EIMP, "utf8");
  assert.ok(src.includes("status: 413"), "statut 413");
  assert.ok(src.includes("MAX_SIZE"), "constante MAX_SIZE");
});

test("editions import : validation PDF via estPdf", () => {
  const src = readFileSync(EIMP, "utf8");
  assert.ok(src.includes("estPdf(buf)"), "estPdf utilisé");
  assert.ok(src.includes("Le contenu du fichier n'est pas un PDF valide."), "message PDF invalide");
});

test("editions import : ImportValidationError → 400", () => {
  const src = readFileSync(EIMP, "utf8");
  assert.ok(src.includes("ImportValidationError"), "ImportValidationError géré");
  assert.ok(src.includes("e instanceof ImportValidationError"), "instanceof");
});

test("editions import : champs requis après parsing → 400", () => {
  const src = readFileSync(EIMP, "utf8");
  assert.ok(src.includes("Le fichier doit contenir numero, dateDebut et dateFin."), "message champs requis");
});

test("editions : pas de req.json() brut", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(!src.includes("req.json()"), "pas de req.json() brut");
});

// ---- Fonctions pures : fichiers ----

test("estPdf : accepte un PDF", () => {
  assert.equal(estPdf(Buffer.from("%PDF-1.7\n")), true);
});

test("estPdf : refuse non-PDF et entrées invalides", () => {
  assert.equal(estPdf(Buffer.from("<html>")), false);
  assert.equal(estPdf(Buffer.from("")), false);
  assert.equal(estPdf(null), false);
  assert.equal(estPdf(undefined), false);
});

test("nomFichierSur : neutralise injection", () => {
  assert.equal(nomFichierSur('a\r\nX-Injected: oui\r\n'), "a  X-Injected: oui");
  assert.equal(nomFichierSur(""), "document.pdf");
  assert.equal(nomFichierSur(null), "document.pdf");
  assert.ok(nomFichierSur("x".repeat(500)).length <= 150);
});

test("enteteContentDisposition : forme RFC 5987", () => {
  const h = enteteContentDisposition("Rapport annuel.pdf");
  assert.equal(h, "inline; filename=\"Rapport annuel.pdf\"; filename*=UTF-8''Rapport%20annuel.pdf");
});

test("editions POST : dates inversées → 400", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes('b.dateDebut > b.dateFin'), "vérification ordre des dates");
  assert.ok(src.includes('"La date de début doit précéder la date de fin."'), "message d'erreur");
});

test("editions PUT : dates inversées → 400", () => {
  const src = readFileSync(EID, "utf8");
  assert.ok(src.includes('f.dateDebut > f.dateFin'), "vérification ordre des dates");
  assert.ok(src.includes('"La date de début doit précéder la date de fin."'), "message d'erreur");
});

test("editions : moyenne de participation négative → 400", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("f0.moyenneParticipation < 0") || src.includes("f.moyenneParticipation < 0"), "validation moyenne");
  assert.ok(src.includes('"La moyenne de participation ne peut pas être négative."'), "message d'erreur");
});

test("editions : heures investies négatives → 400", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("f.heuresInvesties"), "champ heuresInvesties");
  // vérifié dans la boucle des compteurs
  assert.ok(src.includes("Les compteurs ne peuvent pas être négatifs."), "message compteurs");
});

test("editions : sous-structures JSON validées", () => {
  const src = readFileSync(E, "utf8");
  assert.ok(src.includes("Participants par jour invalides."), "participantsParJour");
  assert.ok(src.includes("de session invalide."), "nbSessions");
  assert.ok(src.includes("de session invalide."), "dureeMinutes");
  assert.ok(src.includes("de session invalide."), "participants session");
});