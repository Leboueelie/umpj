// Tests SQL en lecture seule des PRÉDICATS de chargement Banque (mission B3-C).
//
// Exécution : `node --test tests/*.test.mjs`
// GATED : sans BANQUE_TEST_DATABASE_URL, tous les tests sont ignorés (skip).
//   Exemple locale :
//   BANQUE_TEST_DATABASE_URL=postgres://postgres:localtest@127.0.0.1:5435/umpj_s1_test
// GARDE ANTI-PRODUCTION : l'URL doit viser localhost/127.0.0.1 et ne jamais
//   contenir "neon" — sinon chaque test échoue explicitement (base de
//   production jamais touchée).
// LECTURE SEULE ABSOLUE : les prédicats réels (SQL_* exportés par
//   lib/banque-api.ts) s'exécutent sur des CTE VALUES — jamais sur une table,
//   aucune écriture, aucun INSERT/UPDATE/DELETE. Le succès de ces tests
//   prouve aussi l'absence d'erreur de conversion sur dates malformées
//   (valeurs tortures incluses : "", "abcd", "'; DROP TABLE "Ligne";--").
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  SQL_LIGNES_PERIODE,
  SQL_ENTREES_PERIODE,
  SQL_EDITIONS_PERIODE,
} from "../lib/banque-api.ts";
import { estDateIsoCalendaire, statutLigne, statutMois, statutEdition } from "../lib/banque.ts";

const URL_DB = process.env.BANQUE_TEST_DATABASE_URL ?? "";
const SAUT = URL_DB === "" ? "BANQUE_TEST_DATABASE_URL absent : tests SQL ignorés" : false;
const LOCALE = /localhost|127\.0\.0\.1/.test(URL_DB) && !/neon/i.test(URL_DB);

// Périodes de référence (identiques aux cas du cahier des charges B3-C)
const P1 = { du: "2025-01-01", au: "2025-12-31" }; // année 2025
const P2 = { du: "2026-02-01", au: "2026-02-28" }; // février 2026
const P3 = { du: "2025-11-01", au: "2026-03-31" }; // nov 2025 → mars 2026

let client = null;

async function requeter(sql, params) {
  assert.ok(
    LOCALE,
    "BANQUE_TEST_DATABASE_URL doit viser une base de TEST locale (localhost/127.0.0.1) — la production (neon) est interdite"
  );
  if (!client) {
    const { Client } = await import("pg");
    client = new Client({ connectionString: URL_DB });
    await client.connect();
  }
  const r = await client.query(sql, params);
  return r.rows;
}

after(() => client?.end());

/** Littéral SQL texte sécurisé (guillemets doublés). */
const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;

/** Exécute SQL_LIGNES_PERIODE sur une CTE VALUES de dates (aucune table). */
function surMaisons(dates, moisDu, moisAu) {
  const valeurs = dates
    .map((d, i) => `(${lit(`l${i}`)},${lit(d)},'08:00','09:00',1)`)
    .join(",");
  const sql = SQL_LIGNES_PERIODE.replace('FROM "Ligne"', "FROM v");
  return requeter(
    `WITH v("id","date","heureDebut","heureFin","nombrePersonnes") AS (VALUES ${valeurs}) ${sql}`,
    [moisDu, moisAu]
  );
}

/** Exécute SQL_ENTREES_PERIODE sur une CTE VALUES de mois. */
function surZones(moisListe, moisDu, moisAu) {
  const valeurs = moisListe
    .map((m, i) => `(${lit(`e${i}`)},${lit(`z${i}`)},${lit(m)},NULL,1)`)
    .join(",");
  const sql = SQL_ENTREES_PERIODE.replace('FROM "EntreeZone"', "FROM v");
  return requeter(
    `WITH v("id","zoneId","mois","tempsMis","participants") AS (VALUES ${valeurs}) ${sql}`,
    [moisDu, moisAu]
  );
}

/** Exécute SQL_EDITIONS_PERIODE sur une CTE VALUES d'intervalles. */
function surEditions(paires, du, au) {
  const valeurs = paires
    .map(([ref, d1, d2], i) => `(${lit(`e${i}`)},${i + 1},${lit(d1)},${lit(d2)},60,10,'[]')`)
    .join(",");
  const sql = SQL_EDITIONS_PERIODE.replace('FROM "Edition"', "FROM v");
  return requeter(
    `WITH v("id","numero","dateDebut","dateFin","heuresInvesties","moyenneParticipation","participantsParJour") AS (VALUES ${valeurs}) ${sql}`,
    [du, au]
  );
}

// ---- 1. Table du cahier des charges : chargement + classement C ----

test("maisons : dates non calendaire toujours chargees, valide hors periode exclue (table B3-C)", { skip: SAUT }, async () => {
  const cas = [
    { d: "2025-13-01", p: P1, m: ["2025-01", "2025-12"], chargee: true, statut: "invalide" },
    { d: "2025-00-01", p: P2, m: ["2026-02", "2026-02"], chargee: true, statut: "invalide" },
    { d: "2025-02-31", p: P2, m: ["2026-02", "2026-02"], chargee: true, statut: "invalide" },
    { d: "2025-02-31", p: P3, m: ["2025-11", "2026-03"], chargee: true, statut: "invalide" },
    { d: "25/08/2025", p: P2, m: ["2026-02", "2026-02"], chargee: true, statut: "invalide" },
    { d: "2024-05-06", p: P2, m: ["2026-02", "2026-02"], chargee: false, statut: "exclus" },
    { d: "2026-02-10", p: P2, m: ["2026-02", "2026-02"], chargee: true, statut: "inclus" },
  ];
  for (const c of cas) {
    const rows = await surMaisons([c.d], c.m[0], c.m[1]);
    assert.equal(
      rows.length,
      c.chargee ? 1 : 0,
      `${c.d} / periode ${c.m[0]}..${c.m[1]} : ${c.chargee ? "doit etre chargee" : "doit rester exclue"}`
    );
    // statutLigne "invalide" <=> categorie C (filtrerLignes : inclus/exclus/invalide)
    assert.equal(statutLigne(c.d, c.p), c.statut, `moteur sur ${c.d} / ${JSON.stringify(c.p)}`);
    if (c.statut === "invalide") {
      // la ligne est transmise au moteur ET classee nonEvaluables (C)
      assert.notEqual(statutLigne(c.d, c.p), "exclus", "jamais perdue en 'exclus' silencieux");
    }
  }
});

// ---- 2. Accord SQL <-> moteur sur une matrice (torture + bissextiles) ----

test("accord SQL <-> estDateIsoCalendaire : 0 ecart sur la matrice, aucune erreur de conversion", { skip: SAUT }, async () => {
  const valeurs = [
    "2025-13-01", "2025-00-01", "2025-02-31", "2025-04-31", "2025-11-31",
    "2026-02-29", "2026-12-32", "1900-02-29", "2000-02-29", "2024-02-29",
    "2025-02-29", "0000-02-29", "0000-01-01", "0050-01-01", "9999-12-31",
    "9999-99-99", "2024-05-06", "2025-01-15", "2025-02-28", "2026-02-10",
    "2025-11-15", "2026-03-20", "25/08/2025", "2026-2-3", "", "abcd",
    "'; DROP TABLE \"Ligne\";--",
  ];
  const periodes = [
    ["P1", "2025-01", "2025-12"],
    ["P2", "2026-02", "2026-02"],
    ["P3", "2025-11", "2026-03"],
  ];
  for (const [nom, m1, m2] of periodes) {
    const rows = await surMaisons(valeurs, m1, m2);
    const chargees = new Set(rows.map((r) => r.date));
    for (const v of valeurs) {
      const calendaire = estDateIsoCalendaire(v);
      const attendu = !calendaire || (v.slice(0, 7) >= m1 && v.slice(0, 7) <= m2);
      assert.equal(
        chargees.has(v),
        attendu,
        `${nom} ${JSON.stringify(v)} : SQL=${chargees.has(v)} attendu=${attendu} (moteur calendaire=${calendaire})`
      );
    }
  }
  // la requete ayant reussi malformées comprises = aucune erreur SQL (cf. en-tete)
});

// ---- 3. Zones : pas de regression sur les mois invalides ----

test("zones : mois invalides toujours charges, mois valides borres par la periode", { skip: SAUT }, async () => {
  const invalides = ["2025-13", "2025-00", "2026-13", "202502", ""];
  const valeurs = [...invalides, "2025-02", "2026-02"];

  // P2 = fevrier 2026 : invalides toujours la, valides de fevrier 2026 aussi
  const r2 = await surZones(valeurs, "2026-02", "2026-02");
  const s2 = new Set(r2.map((r) => r.mois));
  for (const m of invalides) assert.ok(s2.has(m), `mois invalide ${JSON.stringify(m)} charge sous P2`);
  assert.ok(s2.has("2026-02"), "mois valide couvert charge");
  assert.ok(!s2.has("2025-02"), "mois valide hors periode exclu");

  // P1 = annee 2025 : "2025-02" couvert, "2026-02" non (mais invalides toujours)
  const r1 = await surZones(valeurs, "2025-01", "2025-12");
  const s1 = new Set(r1.map((r) => r.mois));
  assert.ok(s1.has("2025-02"), "mois valide couvert sous P1");
  assert.ok(!s1.has("2026-02"), "mois valide hors P1 exclu");

  // Moteur : statutMois inchange (mois invalide -> C)
  for (const m of invalides) assert.equal(statutMois(m, P2), "invalide", `${m} -> categorie C`);
  assert.equal(statutMois("2025-02", P2), "exclus");
  assert.equal(statutMois("2026-02", P2), "inclus");
});

// ---- 4. Editions : logique inchangee ----

test("editions : intervalle inverse toujours charge, chevauchement borne (aucune modification)", { skip: SAUT }, async () => {
  const rows = await surEditions(
    [
      ["inv", "2026-02-20", "2026-02-10"], // inverse -> toujours charge
      ["chev", "2026-02-01", "2026-02-05"], // chevauche fevrier 2026
      ["hors", "2025-05-01", "2025-05-10"], // sans chevauchement -> exclu
    ],
    P2.du,
    P2.au
  );
  const refs = rows.map((r) => r.id).sort();
  assert.deepEqual(refs, ["e0", "e1"], "inverse + chevauchement charges, hors periode exclu");

  // Moteur inchange (B2-F) : inverse -> invalide (C), chevauchement -> inclus, hors -> exclus
  assert.equal(statutEdition("2026-02-20", "2026-02-10", P2), "invalide");
  assert.equal(statutEdition("2026-02-01", "2026-02-05", P2), "inclus");
  assert.equal(statutEdition("2025-05-01", "2025-05-10", P2), "exclus");
});
