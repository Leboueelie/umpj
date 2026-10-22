// Tests du service des API Banque (mission B3). Exécution : `node --test tests/*.test.mjs`
// PRÉREQUIS : Node.js >= 22.18 (type stripping natif des fichiers .ts).
// Aucune dépendance, aucune base : la `RequeteDb` est simulée (factice),
// conformément à la préférence du dépôt pour les fonctions pures/mocks.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lirePeriodeDepuisParams,
  construireIndexBanque,
  lireIndexBanque,
  executerIndex,
  executerResume,
  SQL_LIGNES_PERIODE,
  SQL_ENTREES_PERIODE,
  SQL_EDITIONS_PERIODE,
} from "../lib/banque-api.ts";

// ---- Fabrique de RequeteDb simulée ----

function fausseRequete(opts = {}) {
  const {
    nbLignes = 0,
    dates = [],
    nbEntrees = 0,
    mois = [],
    indexEditions = [],
    lignes = [],
    entrees = [],
    editions = [],
  } = opts;
  const appels = [];
  const q = async (texte, params) => {
    appels.push({ texte: texte.trim(), params });
    if (texte.includes('count(*)::int AS nb FROM "Ligne"')) return { rows: [{ nb: nbLignes }] };
    if (texte.includes("DISTINCT date")) return { rows: dates.map((d) => ({ date: d })) };
    if (texte.includes('count(*)::int AS nb FROM "EntreeZone"')) return { rows: [{ nb: nbEntrees }] };
    if (texte.includes("DISTINCT mois")) return { rows: mois.map((m) => ({ mois: m })) };
    if (texte.includes('ORDER BY "dateDebut" DESC')) return { rows: indexEditions };
    if (texte.includes('FROM "Ligne"')) return { rows: lignes };
    if (texte.includes('FROM "EntreeZone"')) return { rows: entrees };
    if (texte.includes('FROM "Edition"')) return { rows: editions };
    throw new Error(`requête simulée inconnue : ${texte}`);
  };
  return { q, appels };
}

const P_VALIDE = new URLSearchParams({ du: "01/02/2026", au: "28/02/2026" });

// ---- Validation des paramètres de période ----

test("lirePeriodeDepuisParams : saisie acceptée, contrats 400 explicites", () => {
  assert.deepEqual(lirePeriodeDepuisParams(new URLSearchParams({ du: "2026-02-01", au: "2026-02-28" })), {
    ok: true,
    periode: { du: "2026-02-01", au: "2026-02-28" },
  });
  assert.deepEqual(lirePeriodeDepuisParams(P_VALIDE), {
    ok: true,
    periode: { du: "2026-02-01", au: "2026-02-28" },
  });

  const absent = lirePeriodeDepuisParams(new URLSearchParams({ au: "2026-02-28" }));
  assert.deepEqual(absent, { ok: false, erreur: "du et au sont requis." });

  const vides = lirePeriodeDepuisParams(new URLSearchParams({ du: "", au: "" }));
  assert.equal(vides.ok, false, "paramètre présent mais vide : période invalide");

  const inversee = lirePeriodeDepuisParams(new URLSearchParams({ du: "2026-02-28", au: "2026-02-01" }));
  assert.equal(inversee.ok, false);
  assert.equal((inversee).erreur, "Période invalide : bornes illisibles, non calendaires ou du > au.");

  const nonCalendaire = lirePeriodeDepuisParams(new URLSearchParams({ du: "2026-02-31", au: "2026-03-10" }));
  assert.equal(nonCalendaire.ok, false);

  const illisible = lirePeriodeDepuisParams(new URLSearchParams({ du: "abc", au: "2026-02-28" }));
  assert.equal(illisible.ok, false);
});

test("executerResume : période invalide refusée AVANT tout appel base", async () => {
  const { q, appels } = fausseRequete();
  const rep = await executerResume(q, new URLSearchParams({ du: "01/02/2026" }));
  assert.deepEqual(rep, { ok: false, status: 400, erreur: "du et au sont requis." });
  assert.equal(appels.length, 0, "aucune requête SQL sur période absente");

  const inv = await executerResume(q, new URLSearchParams({ du: "2026-02-28", au: "2026-02-01" }));
  assert.equal(inv.ok, false);
  assert.equal(inv.status, 400);
  assert.equal(appels.length, 0, "aucune requête SQL sur période inversée");
});

// ---- Index ----

test("construireIndexBanque : base vide, aucune période inventée", async () => {
  const { q } = fausseRequete();
  const rep = await executerIndex(q);
  assert.equal(rep.ok, true);
  assert.deepEqual(rep.donnees, {
    maisons: { donnees: false, nbLignes: 0, periode: null },
    zones: { donnees: false, nbEntrees: 0, mois: [] },
    editions: { donnees: false, nbEditions: 0, editions: [] },
  });
});

test("construireIndexBanque : bornes calendaires, mois valides, éditions normalisées", async () => {
  const { q } = fausseRequete({
    nbLignes: 7, // compteur honnête : inclut les dates non ISO
    dates: ["2026-02-01", "2026-02-31", "2026-01-15"], // 2026-02-31 non calendaire
    nbEntrees: 4,
    mois: ["2026-13", "2026-01", "2025-12"],
    indexEditions: [
      { numero: 31, dateDebut: new Date(2026, 1, 17), dateFin: new Date(2026, 1, 22) },
      { numero: 30, dateDebut: "25/08/2025", dateFin: "2025-08-30" },
    ],
  });
  const rep = await executerIndex(q);
  assert.equal(rep.ok, true);
  assert.deepEqual(rep.donnees.maisons, {
    donnees: true,
    nbLignes: 7,
    periode: { du: "2026-01-15", au: "2026-02-01" }, // valeur non calendaire écartée des bornes
  });
  assert.deepEqual(rep.donnees.zones, {
    donnees: true,
    nbEntrees: 4,
    mois: ["2025-12", "2026-01"], // "2026-13" exclu de la liste, compté dans nbEntrees
  });
  assert.deepEqual(rep.donnees.editions, {
    donnees: true,
    nbEditions: 2,
    editions: [
      { numero: 31, dateDebut: "2026-02-17", dateFin: "2026-02-22" }, // Date pg -> YYYY-MM-DD
      { numero: 30, dateDebut: null, dateFin: "2025-08-30" }, // source illisible -> null, pas de correction
    ],
  });
});

test("lireIndexBanque : index brut accepté (contrat du builder)", async () => {
  const brut = {
    nbLignes: 1,
    datesLignes: ["2026-05-04"],
    nbEntrees: 0,
    moisEntrees: [],
    editions: [],
  };
  const r = construireIndexBanque(brut);
  assert.deepEqual(r.maisons.periode, { du: "2026-05-04", au: "2026-05-04" });
  const { q } = fausseRequete({
    nbLignes: brut.nbLignes,
    dates: brut.datesLignes,
    nbEntrees: brut.nbEntrees,
    mois: brut.moisEntrees,
    indexEditions: brut.editions,
  });
  const viaQ = await lireIndexBanque(q);
  assert.deepEqual(viaQ, r, "marche identique via la couche SQL simulée");
});

// ---- Rapport de période ----

test("executerResume : base vide -> rapport 3 sections, aucun total général", async () => {
  const { q } = fausseRequete();
  const rep = await executerResume(q, P_VALIDE);
  assert.equal(rep.ok, true);
  const r = rep.donnees;
  assert.deepEqual(r.periode, { du: "2026-02-01", au: "2026-02-28" });
  for (const section of ["maisons", "zones", "editions"]) {
    assert.ok(r[section], `${section} presente`);
    assert.equal(r[section].nbTotal, 0);
    assert.equal(r[section].nbRetenues, 0);
    assert.deepEqual(r[section].anomaliesDisponibles, []);
    assert.deepEqual(r[section].anomaliesPeriode, []);
    assert.deepEqual(r[section].nonEvaluables, []);
  }
  assert.equal("totalGeneral" in r, false, "jamais de total inter-modules");
});

test("executerResume : 3 sections, 3 categories d'anomalies, dates pg normalisees", async () => {
  const { q, appels } = fausseRequete({
    lignes: [
      { id: "ok", date: "2026-02-10", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: -1 },
      { id: "battu", date: "25/08/2025", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 3 },
    ],
    entrees: [{ id: "e1", zoneId: "z1", mois: "2026-13", tempsMis: null, participants: 4 }],
    editions: [
      {
        id: "ed1",
        numero: 31,
        dateDebut: new Date(2026, 1, 17), // forme renvoyee par le pilote pg
        dateFin: new Date(2026, 1, 22),
        heuresInvesties: 145,
        moyenneParticipation: 0,
        participantsParJour: [{ jour: "1er jour", date: "17 02 2026", participants: 100 }],
      },
    ],
  });
  const rep = await executerResume(q, P_VALIDE);
  assert.equal(rep.ok, true);
  const r = rep.donnees;
  assert.equal("totalGeneral" in r, false);

  // Maisons : categorie A (toutes donnees), B (retenues), C (indeterminables)
  assert.equal(r.maisons.nbTotal, 2);
  assert.equal(r.maisons.nbRetenues, 1, "ligne a date ISO dans la periode retenue");
  const aMaisons = r.maisons.anomaliesDisponibles.map((a) => `${a.reference}:${a.code}`);
  assert.ok(aMaisons.includes("ok:participants-invalides"), "A porte la anomalie de valeur de la ligne retenue");
  assert.ok(aMaisons.includes("battu:date-non-normalee"), "A porte l'anomalie de periode");
  const bMaisons = r.maisons.anomaliesPeriode.map((a) => `${a.reference}:${a.code}`);
  assert.deepEqual(bMaisons, ["ok:participants-invalides"], "B = seules lignes retenues");
  for (const refB of bMaisons) assert.ok(aMaisons.includes(refB), "B est un sous-ensemble de A");
  assert.equal(r.maisons.nonEvaluables.length, 1, "categorie C");
  assert.equal(r.maisons.nonEvaluables[0].reference, "battu");
  assert.deepEqual(
    r.maisons.nonEvaluables[0].anomalies.map((a) => a.code),
    ["date-non-normalee"]
  );
  assert.ok(!bMaisons.some((x) => x.startsWith("battu")), "C n'entre jamais en B");

  // Zones : mois illisible -> C, duree absente signalee en A
  assert.equal(r.zones.nbRetenues, 0);
  assert.equal(r.zones.nonEvaluables.length, 1);
  assert.deepEqual(
    r.zones.nonEvaluables[0].anomalies.map((a) => a.code).sort(),
    ["duree-absente", "mois-invalide"]
  );
  assert.deepEqual(r.zones.anomaliesPeriode, [], "aucune entree retenue");
  assert.equal(r.zones.anomaliesDisponibles.length, 2, "A signale quand meme la source");

  // Editions : dates Date pg normalisees a la frontiere -> retenue + agregats
  assert.equal(r.editions.nbRetenues, 1, "dates pg normalisees avant le moteur");
  assert.equal(r.editions.agregat.nbEditions, 1);
  assert.equal(r.editions.agregat.totalHeuresInvestiesMin, 145);
  assert.equal(r.editions.agregat.nbMoyennePositive, 0, "moyenne 0 : fait, sans recalcul");
  const codesEd = r.editions.anomaliesPeriode.map((a) => a.code);
  assert.ok(codesEd.includes("moyenne-zero"), "zero signale en B (edition retenue)");
  assert.ok(r.editions.anomaliesDisponibles.map((a) => a.code).includes("moyenne-zero"));

  // Parametrage SQL du resume
  assert.equal(appels.length, 3, "3 SELECT de chargement");
  assert.deepEqual(appels[0].params, ["2026-02", "2026-02"], "Ligne bornee par les mois");
  assert.deepEqual(appels[1].params, ["2026-02", "2026-02"], "EntreeZone bornee par les mois");
  assert.deepEqual(appels[2].params, ["2026-02-01", "2026-02-28"], "Edition bornee par les jours");
});

// ---- Contrat B3-C : predicats de chargement (regression) ----

test("SQL_LIGNES_PERIODE : garde calendaire CASE ordonne (pas de perte silencieuse)", () => {
  // 1. forme incorrecte -> toujours chargée (branche 1)
  assert.ok(
    SQL_LIGNES_PERIODE.includes(`WHEN "date" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN TRUE`),
    "branche forme incorrecte presente"
  );
  // 2. ordre des gardes : forme AVANT tout ::int (CASE n'evalue pas les
  //    branches non prises -> aucun cast ne peut voir une valeur malformee)
  const iForme = SQL_LIGNES_PERIODE.indexOf("!~");
  const iMois = SQL_LIGNES_PERIODE.indexOf('substring("date", 6, 2)::int NOT BETWEEN 1 AND 12');
  const iJour = SQL_LIGNES_PERIODE.indexOf('substring("date", 9, 2)::int NOT BETWEEN 1 AND 31');
  assert.ok(iForme !== -1 && iMois > iForme && iJour > iMois, "ordre forme -> mois -> jour");
  // 3. validation calendaire (mois 02, bissextile) identique au moteur
  assert.ok(SQL_LIGNES_PERIODE.includes("% 400 = 0"), "regle bissextile %400");
  assert.ok(SQL_LIGNES_PERIODE.includes("% 100 <> 0"), "regle bissextile %100");
  assert.ok(SQL_LIGNES_PERIODE.includes("WHEN '04' THEN 30"), "mois a 30 jours");
  // 4. la periode ne borne QUE les dates valides (branche ELSE finale)
  assert.ok(
    SQL_LIGNES_PERIODE.includes('ELSE substring("date", 1, 7) BETWEEN $1 AND $2'),
    "fenetre de mois en ELSE uniquement"
  );
  // 5. zones : domaine mois embarque dans la regex (inchange) ;
  //    editions : intervalle inverse toujours charge (inchange)
  assert.ok(SQL_ENTREES_PERIODE.includes("(0[1-9]|1[0-2])"), "regex zone a son domaine 01-12");
  assert.ok(SQL_EDITIONS_PERIODE.includes('"dateFin" < "dateDebut"'), "edition inverse inchangee");
  for (const sql of [SQL_LIGNES_PERIODE, SQL_ENTREES_PERIODE, SQL_EDITIONS_PERIODE]) {
    assert.match(sql, /^SELECT/i, "lecture uniquement");
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
  }
});

test("executerResume : dates non calendaires transmises au moteur -> categorie C, portee A explicite", async () => {
  const { q, appels } = fausseRequete({
    lignes: [
      // simulations de CE QUE LE SQL (corrige) doit fournir pour P2 = fev 2026 :
      { id: "m13", date: "2025-13-01", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 2 },
      { id: "m00", date: "2025-00-01", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 2 },
      { id: "f31", date: "2025-02-31", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 2 },
      { id: "fmt", date: "25/08/2025", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 2 },
      // valide HORS periode : fournie par ce mock, doit rester hors C/B
      { id: "hors", date: "2024-05-06", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: -1 },
      // valide DANS la periode
      { id: "ok", date: "2026-02-10", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 2 },
    ],
  });
  const rep = await executerResume(q, P_VALIDE);
  assert.equal(rep.ok, true);
  const r = rep.donnees;

  // C = les 4 dates non calendaires uniquement ; la valide hors periode n'y est pas
  const refsC = r.maisons.nonEvaluables.map((x) => x.reference).sort();
  assert.deepEqual(refsC, ["f31", "fmt", "m00", "m13"], "categorie C : toutes les dates non calendaires");
  for (const c of r.maisons.nonEvaluables) {
    assert.equal(c.anomalies[0].code, "date-non-normalee", `C porte l'anomalie de ${c.reference}`);
  }
  assert.ok(!refsC.includes("hors"), "date valide hors periode : jamais en C (statut exclu)");
  assert.ok(!refsC.includes("ok"), "date valide dans la periode : jamais en C");

  // Compteurs : toutes les donnees fournies comptent, seules les valides de la periode sont retenues
  assert.equal(r.maisons.nbTotal, 6, "nbTotal = donnees effectivement fournies");
  assert.equal(r.maisons.nbRetenues, 1, "seule la ligne valide de fevrier 2026");

  // Portee A : anomalies des donnees FOURNIES (y compris la valide hors periode),
  // pas un inventaire exhaustif de la base
  const aMaisons = r.maisons.anomaliesDisponibles.map((a) => `${a.reference}:${a.code}`).sort();
  assert.deepEqual(aMaisons, [
    "f31:date-non-normalee",
    "fmt:date-non-normalee",
    "hors:participants-invalides",
    "m00:date-non-normalee",
    "m13:date-non-normalee",
  ]);
  // B reste un sous-ensemble de A, limite aux lignes retenues
  assert.deepEqual(r.maisons.anomaliesPeriode, [], "aucune anomalie sur la seule ligne retenue");

  // Parametrage SQL inchange (mois bornants, pas de nouveau parametre)
  assert.deepEqual(appels[0].params, ["2026-02", "2026-02"]);
});



test("executerResume / executerIndex : echec DB -> 500 generique, sans fuite", async () => {
  const leak = async () => {
    throw new Error('password authentication failed for user "neon_external" at host "ep-cool.aws.neon.tech"');
  };
  const r1 = await executerResume(leak, P_VALIDE);
  assert.deepEqual(r1, { ok: false, status: 500, erreur: "Erreur de service." });
  const r2 = await executerIndex(leak);
  assert.deepEqual(r2, { ok: false, status: 500, erreur: "Erreur de service." });
  const brut = JSON.stringify(r1) + JSON.stringify(r2);
  assert.ok(!brut.includes("neon"), "hote/identifiant base jamais exposes");
  assert.ok(!brut.includes("password"), "detail SQL jamais expose");
  assert.ok(!brut.includes("Error:"), "pas de trace d'exception");
});

// ---- Lecture seule ----

test("toutes les requetes du service sont des SELECT parametres", async () => {
  const { q, appels } = fausseRequete({
    nbLignes: 1,
    dates: ["2026-02-10"],
    nbEntrees: 1,
    mois: ["2026-02"],
    indexEditions: [{ numero: 1, dateDebut: "2026-02-17", dateFin: "2026-02-22" }],
    lignes: [{ id: "l1", date: "2026-02-10", heureDebut: "08:00", heureFin: "09:00", nombrePersonnes: 2 }],
    entrees: [{ id: "e1", zoneId: "z1", mois: "2026-02", tempsMis: 60, participants: 3 }],
    editions: [{ id: "ed1", numero: 1, dateDebut: new Date(2026, 1, 17), dateFin: new Date(2026, 1, 22), heuresInvesties: 60, moyenneParticipation: 10, participantsParJour: [] }],
  });
  const ri = await executerIndex(q);
  const rr = await executerResume(q, P_VALIDE);
  assert.equal(ri.ok, true);
  assert.equal(rr.ok, true);
  assert.equal(appels.length, 8, "5 requetes index + 3 requetes resume");
  for (const a of appels) {
    assert.match(a.texte, /^SELECT/i, "lecture uniquement");
    assert.doesNotMatch(
      a.texte,
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i,
      "aucune ecriture ni DDL"
    );
  }
  for (const a of appels.slice(0, 5)) {
    assert.equal(a.params, undefined, "index : SQL constant sans parametre");
  }
});
