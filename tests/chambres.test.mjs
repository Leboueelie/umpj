// Tests ciblés — Chambres de prière (app/api/chambres/*).
// Aucune base, aucun réseau : vérifications statiques de la source + contrats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = "app/api/chambres/route.ts";
const RID = "app/api/chambres/[id]/route.ts";

test("chambres : route principale existe et expose GET/POST", () => {
  const src = readFileSync(R, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
});

test("chambres GET : filtre par zoneId présent", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('searchParams.get("zoneId")'), "zoneId lu depuis les params");
  assert.ok(src.includes('WHERE c."zoneId" = $1'), "clause WHERE zoneId présente");
  assert.ok(src.includes("ORDER BY c.\"ordre\" ASC"), "tri par ordre");
});

test("chambres POST : parsing JSON sûr via lireJsonBorne", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
  assert.ok(src.includes("status: lecture.status"), "statut de lecture propagé");
});

test("chambres POST : champs requis → 400", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("if (!zoneId || !lieu || !fardeau || !dirigeants)"), "validation des champs requis");
  assert.ok(src.includes('"Tous les champs sont obligatoires."'), "message d'erreur");
  assert.ok(src.includes("status: 400"), "statut 400");
});

test("chambres POST : zone inexistante → 404", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('SELECT id FROM "Zone" WHERE id = $1'), "vérification de la zone");
  assert.ok(src.includes("c.rowCount === 0"), "rowCount vérifié");
  assert.ok(src.includes('"Zone introuvable."'), "message 404");
  assert.ok(src.includes("status: 404"), "statut 404");
});

test("chambres POST : création retourne 201", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("status: 201"), "statut 201 à la création");
  assert.ok(src.includes("crypto.randomUUID()"), "id généré");
});

test("chambres POST : trim des champs texte", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes('.toString().trim()'), "trim appliqué");
});

test("chambres [id] : GET/PUT/DELETE exposés", () => {
  const src = readFileSync(RID, "utf8");
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function PUT/);
  assert.match(src, /export async function DELETE/);
});

test("chambres [id] GET : 404 si introuvable", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "rowCount vérifié");
  assert.ok(src.includes('"Chambre introuvable."'), "message 404");
});

test("chambres [id] PUT : champs requis → 400", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes("if (!lieu || !fardeau || !dirigeants)"), "validation PUT");
  assert.ok(src.includes('"Tous les champs sont obligatoires."'), "message 400");
});

test("chambres [id] PUT : parsing JSON sûr", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
});

test("chambres [id] PUT : 404 si introuvable", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "rowCount vérifié");
  assert.ok(src.includes('"Chambre introuvable."'), "message 404");
});

test("chambres [id] PUT : champ actif optionnel (COALESCE)", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes('COALESCE($5, "actif")'), "actif optionnel");
});

test("chambres [id] DELETE : 404 si introuvable", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes("r.rowCount === 0"), "rowCount vérifié");
  assert.ok(src.includes('"Chambre introuvable."'), "message 404");
});

test("chambres [id] DELETE : retourne { ok: true }", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes('NextResponse.json({ ok: true })'), "réponse ok");
});

test("chambres : réponses JSON cohérentes (NextResponse.json)", () => {
  const src1 = readFileSync(R, "utf8");
  const src2 = readFileSync(RID, "utf8");
  assert.ok(src1.includes("NextResponse.json"), "route principale");
  assert.ok(src2.includes("NextResponse.json"), "route [id]");
});

test("chambres : pas de req.json() non gardé", () => {
  const src1 = readFileSync(R, "utf8");
  const src2 = readFileSync(RID, "utf8");
  assert.ok(!src1.includes("req.json()"), "pas de req.json() brut");
  assert.ok(!src2.includes("req.json()"), "pas de req.json() brut");
});

test("chambres POST : limite de longueur des champs texte", () => {
  const src = readFileSync(R, "utf8");
  assert.ok(src.includes("lieu.length > 200"), "limite lieu");
  assert.ok(src.includes("fardeau.length > 500"), "limite fardeau");
  assert.ok(src.includes("dirigeants.length > 300"), "limite dirigeants");
  assert.ok(src.includes("contacts.length > 100"), "limite contacts");
});

test("chambres PUT : limite de longueur des champs texte", () => {
  const src = readFileSync(RID, "utf8");
  assert.ok(src.includes("lieu.length > 200"), "limite lieu");
  assert.ok(src.includes("fardeau.length > 500"), "limite fardeau");
  assert.ok(src.includes("dirigeants.length > 300"), "limite dirigeants");
  assert.ok(src.includes("contacts.length > 100"), "limite contacts");
});
