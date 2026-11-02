// Tests ciblés — Historique des rapports (P4.x).
// Exécution : `node --test tests/rapports-historique.test.mjs`
// PRÉREQUIS : Node.js >= 22.18 (type stripping natif).
// Les tests SQL sont env-gated sur BANQUE_TEST_DATABASE_URL (base locale isolée).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LISTE = "app/api/rapports/historique/route.ts";
const DETAIL = "app/api/rapports/historique/[id]/route.ts";
const PDF = "app/api/rapports/historique/[id]/pdf/route.ts";
const XLSX = "app/api/rapports/historique/[id]/xlsx/route.ts";
const PAGE = "app/rapports/historique/page.tsx";

function src(p) { return readFileSync(p, "utf8"); }

// ---- 1. Pas de route de modification/suppression (immuabilité applicative) ----

test("historique : aucune route UPDATE/PATCH/DELETE pour les archives", () => {
  for (const p of [LISTE, DETAIL, PDF, XLSX]) {
    const s = src(p);
    assert.doesNotMatch(s, /export async function (PATCH|PUT|DELETE)/,
      `${p} ne doit pas exposer PATCH/PUT/DELETE`);
  }
});

test("historique : POST (archivage) exposé sur la liste", () => {
  assert.match(src(LISTE), /export async function POST/);
});

test("historique : GET exposé sur liste, détail, pdf, xlsx", () => {
  for (const p of [LISTE, DETAIL, PDF, XLSX]) {
    assert.match(src(p), /export async function GET/, `${p} doit exposer GET`);
  }
});

// ---- 2. Autorisations ADMIN ----

test("historique : requireAdmin présent dans toutes les routes", () => {
  for (const p of [LISTE, DETAIL, PDF, XLSX]) {
    assert.ok(src(p).includes("requireAdmin"), `${p} doit appeler requireAdmin`);
  }
});

// ---- 3. Liste : métadonnées uniquement (pas de BYTEA ni snapshot) ----

test("historique liste : pas de sélection de pdfData/xlsxData/snapshot", () => {
  const s = src(LISTE);
  const getStart = s.indexOf("export async function GET");
  const postStart = s.indexOf("export async function POST");
  assert.ok(getStart >= 0 && postStart > getStart, "GET et POST présents");
  const getS = s.slice(getStart, postStart);
  const m = getS.match(/SELECT[\s\S]*?FROM "RapportGenere"[\s\S]*?LIMIT/);
  assert.ok(m, "requête de liste présente");
  assert.doesNotMatch(m[0], /pdfData|xlsxData|snapshot/, "la liste ne charge pas les octets ni le snapshot");
  assert.doesNotMatch(getS, /pdfData/, "pas de pdfData dans la réponse de liste");
  assert.doesNotMatch(getS, /snapshot/, "pas de snapshot dans la réponse de liste");
});

test("historique liste : pagination limit/offset présente", () => {
  const s = src(LISTE);
  assert.ok(s.includes("limit") && s.includes("offset"), "pagination serveur");
  assert.ok(s.includes('ORDER BY "dateGeneration" DESC, "id" DESC'), "ordre stable");
});

test("historique liste : filtres q/module/format/du/au", () => {
  const s = src(LISTE);
  for (const f of ['"q"', '"module"', '"format"', '"du"', '"au"']) {
    assert.ok(s.includes(f), `filtre ${f} présent`);
  }
});

// ---- 4. Détail : snapshot présent, pas d'octets ----

test("historique détail : retourne snapshot mais pas pdfData/xlsxData", () => {
  const s = src(DETAIL);
  assert.ok(s.includes('"snapshot"'), "snapshot retourné");
  assert.doesNotMatch(s, /"pdfData"|"xlsxData"/, "pas d'octets binaires dans le détail");
  assert.ok(s.includes('estUuid') || /uuid/i.test(s), "validation UUID");
});

// ---- 5. Téléchargement : vérification taille + SHA-256 ----

test("historique pdf : vérifie taille et SHA-256", () => {
  const s = src(PDF);
  assert.ok(s.includes("pdfTaille"), "vérification taille");
  assert.ok(s.includes("pdfSha256"), "vérification SHA-256");
  assert.ok(s.includes("createHash"), "calcul SHA-256");
  assert.ok(s.includes('application/pdf'), "Content-Type PDF");
});

test("historique xlsx : vérifie taille et SHA-256", () => {
  const s = src(XLSX);
  assert.ok(s.includes("xlsxTaille"), "vérification taille");
  assert.ok(s.includes("xlsxSha256"), "vérification SHA-256");
  assert.ok(s.includes("createHash"), "calcul SHA-256");
  assert.ok(s.includes("spreadsheetml"), "Content-Type XLSX");
});

// ---- 6. Page : structure attendue ----

test("historique page : masthead + back-link + tableau + filtres + pagination", () => {
  const s = src(PAGE);
  assert.ok(s.includes("accueil-identite"), "masthead");
  assert.ok(s.includes('back-link">← Rapports'), "back-link");
  assert.ok(s.includes("<table>"), "tableau");
  assert.ok(s.includes("Précédent") && s.includes("Suivant"), "pagination");
  assert.ok(s.includes("Aucun rapport archivé."), "état vide");
});

// ---- 7. Intégrité SQL : env-gated ----

import { estUrlTestLocale } from "./helpers/garde-test.mjs";

const dbUrl = process.env.BANQUE_TEST_DATABASE_URL;
const sqlActif = estUrlTestLocale(dbUrl);

test(
  "historique SQL : table RapportGenere présente avec contraintes",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale — exécution refusée");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      const r = await pool.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = '"RapportGenere"'::regclass ORDER BY conname`
      );
      const names = r.rows.map((x) => x.conname);
      assert.ok(names.includes("RapportGenere_pkey"), "PK présente");
      assert.ok(names.includes("RapportGenere_format_check"), "check format");
      assert.ok(names.includes("RapportGenere_format_fichiers_check"), "check fichiers");
      assert.ok(names.includes("RapportGenere_pdf_meta_check"), "check meta PDF");
      assert.ok(names.includes("RapportGenere_xlsx_meta_check"), "check meta XLSX");
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

test(
  "historique SQL : aucun trigger d'immuabilité applicatif (P4.4)",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale — exécution refusée");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM pg_trigger WHERE tgrelid = '"RapportGenere"'::regclass AND tgname NOT LIKE 'RI_%'`
      );
      assert.equal(r.rows[0].n, 0, "aucun trigger applicatif");
    } finally {
      await pool.end().catch(() => {});
    }
  }
);
