// Tests du moteur de rapports (mission refonte front + rapports).
// Exécution : `node --test tests/*.test.mjs`
// PRÉREQUIS : Node.js >= 22.18 (type stripping natif des fichiers .ts).
// Les fonctions SQL env-gated sont couvertes quand BANQUE_TEST_DATABASE_URL
// est fourni (base locale isolée) ; sinon seul le noyau pur est testé.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validerPeriodeIso,
  MODULES_RAPPORT,
  construireRapport,
} from "../lib/rapports.ts";
import { estUrlTestLocale } from "./helpers/garde-test.mjs";

// ---- 1. Validation de période ISO ----

test("periode : aucune borne → période nulle valide", () => {
  assert.deepEqual(validerPeriodeIso(null, null), { ok: true, periode: null });
});

test("periode : une seule borne → refus", () => {
  assert.equal(validerPeriodeIso("2026-01-01", null).ok, false);
  assert.equal(validerPeriodeIso(null, "2026-01-31").ok, false);
});

test("periode : format non ISO → refus", () => {
  const r = validerPeriodeIso("01/01/2026", "31/01/2026");
  assert.equal(r.ok, false);
  assert.match(r.erreur, /AAAA-MM-JJ/);
});

test("periode : syntaxe ISO mais date calendaire impossible → refus", () => {
  for (const [du, au] of [
    ["2025-99-99", "2025-99-99"],
    ["2025-02-31", "2025-03-01"],
    ["2025-13-01", "2025-13-31"],
    ["2025-00-10", "2025-01-10"],
    ["2025-01-00", "2025-01-10"],
    ["2023-02-29", "2023-03-01"], // 2023 non bissextile
  ]) {
    const r = validerPeriodeIso(du, au);
    assert.equal(r.ok, false, `devrait refuser ${du}..${au}`);
    assert.match(r.erreur, /AAAA-MM-JJ/);
  }
  // 29 février sur année bissextile : accepté.
  assert.equal(validerPeriodeIso("2024-02-29", "2024-02-29").ok, true);
});

test("periode : du > au → refus", () => {
  const r = validerPeriodeIso("2026-02-01", "2026-01-01");
  assert.equal(r.ok, false);
  assert.match(r.erreur, /précéder/);
});

test("periode : bornes valides → période acceptée", () => {
  const r = validerPeriodeIso("2026-01-01", "2026-01-31");
  assert.deepEqual(r, {
    ok: true,
    periode: { du: "2026-01-01", au: "2026-01-31" },
  });
});

// ---- 2. Catalogue des modules ----

test("catalogue : les six modules de comptage sont déclarés", () => {
  assert.deepEqual(
    Object.keys(MODULES_RAPPORT).sort(),
    ["chambres", "croisades", "documents", "equipes", "nuits", "sieges"]
  );
});

// ---- 3. Moteur (SQL) : env-gated sur la base locale isolée ----

const dbUrl = process.env.BANQUE_TEST_DATABASE_URL;
// Garde anti-production : la cible doit être locale (localhost/127.0.0.1).
// Aucun pool n'est créé tant que la cible n'est pas validée.
const sqlActif = estUrlTestLocale(dbUrl);

test(
  "moteur : module inconnu → null",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale — exécution refusée");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      assert.equal(await construireRapport(pool, "inconnu", null, null), null);
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

test(
  "moteur : chambres refuse une période",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale — exécution refusée");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      await assert.rejects(
        () => construireRapport(pool, "chambres", "2026-01-01", "2026-01-31"),
        /période/
      );
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

for (const module of ["equipes", "nuits", "croisades", "sieges", "documents", "chambres"]) {
  test(
    `moteur : rapport ${module} calculable sur base vide`,
    { skip: !sqlActif },
    async () => {
      assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale — exécution refusée");
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: dbUrl, family: 4 });
      try {
        const rapport = await construireRapport(pool, module, null, null);
        assert.equal(rapport.module, module);
        assert.ok(rapport.intitule.length > 0);
        assert.ok(rapport.source.length > 0);
        assert.ok(rapport.indicateurs.length > 0);
        assert.ok(rapport.limites.length > 0);
        assert.equal(typeof rapport.volumesExamines, "number");
        assert.ok(Array.isArray(rapport.anomalies));
        // Aucun total inter-modules ne doit apparaître.
        for (const ind of rapport.indicateurs) {
          assert.ok(!/total général/i.test(ind.libelle));
        }
      } finally {
        await pool.end().catch(() => {});
      }
    }
  );
}

test(
  "moteur : période invalide → rejet",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale — exécution refusée");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      await assert.rejects(
        () => construireRapport(pool, "nuits", "2026-02-01", "2026-01-01"),
        /précéder/
      );
    } finally {
      await pool.end().catch(() => {});
    }
  }
);
