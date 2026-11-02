// Tests de robustesse des API (mission FIX-MÉTIER-01).
// Vérifications statiques de la source : parsing JSON sûr, validation des participants,
// réponse 404 sur suppression de zone inexistante.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROUTES_JSON = [
  "app/api/sujets-priere/route.ts",
  "app/api/equipes-priere/route.ts",
  "app/api/nuits-priere/route.ts",
  "app/api/croisade/route.ts",
  "app/api/sieges-priere/route.ts",
];

test("JSON : les 5 routes mutantes utilisent lireJsonBorne (parsing sûr)", () => {
  for (const f of ROUTES_JSON) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      src.includes("lireJsonBorne"),
      `${f} : lireJsonBorne absent (parsing JSON non borné)`
    );
    assert.ok(
      src.includes("if (!lecture.ok)"),
      `${f} : erreur de lecture non gérée`
    );
    // Le résultat est normalisé en objet (pas null) pour éviter le crash de destructuration.
    assert.ok(
      src.includes("lecture.body ?? {}") || src.includes("lecture.body ??{}") || src.includes("(lecture.body ?? {})"),
      `${f} : corps non normalisé en objet`
    );
  }
});

test("Participants : zones/entrees valide avant écriture", () => {
  const src = readFileSync("app/api/zones/entrees/route.ts", "utf8");
  assert.ok(
    src.includes('Number.isInteger(v) || v < 0'),
    "zones/entrees : validation des participants absente"
  );
  assert.ok(
    src.includes('"Nombre de participants invalide."'),
    "zones/entrees : message d'erreur absent"
  );
  // parseInt remplacé par Number avec validation.
  assert.ok(
    !src.includes("const participants = parseInt(e.participants, 10)"),
    "zones/entrees : parseInt non validé encore présent"
  );
});

test("Participants : zones/import valide avant écriture", () => {
  const src = readFileSync("app/api/zones/import/route.ts", "utf8");
  assert.ok(
    src.includes('Number.isInteger(v) || v < 0'),
    "zones/import : validation des participants absente"
  );
  assert.ok(
    src.includes('"Nombre de participants invalide."'),
    "zones/import : message d'erreur absent"
  );
  assert.ok(
    !src.includes("const participants = parseInt(l.participants, 10)"),
    "zones/import : parseInt non validé encore présent"
  );
});

test("Zone inexistante : DELETE retourne 404", () => {
  const src = readFileSync("app/api/zones/[id]/route.ts", "utf8");
  assert.ok(
    src.includes('r.rowCount === 0'),
    "zones/[id] DELETE : vérification de rowCount absente"
  );
  assert.ok(
    src.includes('"Zone introuvable."'),
    "zones/[id] DELETE : message 404 absent"
  );
  assert.ok(
    src.includes("status: 404"),
    "zones/[id] DELETE : statut 404 absent"
  );
});

test("Zone PATCH : limite de 150 caractères", () => {
  const src = readFileSync("app/api/zones/[id]/route.ts", "utf8");
  assert.ok(src.includes("nom.length > 150"), "zones/[id] PATCH : limite de longueur absente");
  assert.ok(src.includes('"Nom trop long (150 caractères maximum)."'), "zones/[id] PATCH : message d'erreur absent");
});

test("Admin POST : utilise lireJsonBorne", () => {
  const src = readFileSync("app/api/admin/utilisateurs/route.ts", "utf8");
  assert.ok(src.includes("lireJsonBorne"), "lireJsonBorne utilisé");
  assert.ok(src.includes("if (!lecture.ok)"), "erreur de lecture gérée");
  assert.ok(!src.includes("req.json()"), "pas de req.json() brut");
});
