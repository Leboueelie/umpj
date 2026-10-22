// Tests de l'interface Banque (mission B4). Exécution : `node --test tests/*.test.mjs`
// PRÉREQUIS : Node.js >= 22.18 (type stripping natif des fichiers .ts).
// Aucune dépendance (node:test / node:assert uniquement), aucune écriture en
// base : la logique testée est pure (components/banque/logique-banque.ts) et
// le test HTTP utilise un fetch simulé.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LOGIN_BANQUE,
  MSG_PERIODE_ABSENTE,
  MSG_PERIODE_INVALIDE,
  MSG_RESEAU,
  MSG_401,
  MSG_403,
  LIMITE_ANOMALIES,
  periodeCourante,
  periodeRepli,
  periodeInitiale,
  validerPeriodeFr,
  urlResume,
  depasseDeuxAns,
  joursDuMois,
  appelerBanque,
  etatDonnees,
  limiteSuivante,
  restants,
  referenceLisible,
  texteAnomalie,
  texteNonEvaluable,
  LIBELLES_CATEGORIES,
  AIDE_CATEGORIES,
  indicateursMaisons,
  indicateursZones,
  indicateursEditions,
} from "../components/banque/logique-banque.ts";
import { fmtDureeBanque, fmtMinutesHeures, fmtNombre } from "../lib/banque.ts";

// ---- Fabriques ----

const index = (over = {}) => ({
  maisons: { donnees: false, nbLignes: 0, periode: null },
  zones: { donnees: false, nbEntrees: 0, mois: [] },
  editions: { donnees: false, nbEditions: 0, editions: [] },
  ...over,
});

const reponse = (status, corps) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof corps === "string" ? corps : JSON.stringify(corps)),
});

// ---- 1. Initialisation sur l'année civile courante ----

test("periodeCourante : année civile courante (horloge locale)", () => {
  assert.deepEqual(periodeCourante(new Date(2026, 6, 15)), {
    du: "01/01/2026",
    au: "31/12/2026",
  });
  assert.deepEqual(periodeCourante(new Date(2027, 0, 1)), {
    du: "01/01/2027",
    au: "31/12/2027",
  });
});

test("periodeCourante : horloge inexploitable -> null (aucune période inventée)", () => {
  assert.equal(periodeCourante(new Date(NaN)), null);
  assert.equal(periodeInitiale(null, new Date(NaN)), null);
});

test("periodeInitiale : l'année courante prime sur les données disponibles", () => {
  const idx = index({ maisons: { donnees: true, nbLignes: 3, periode: { du: "2019-01-01", au: "2019-12-31" } } });
  assert.deepEqual(periodeInitiale(idx, new Date(2026, 6, 15)), {
    du: "01/01/2026",
    au: "31/12/2026",
  });
});

// ---- 2. Repli sur les bornes de l'index ----

test("periodeRepli : bornes des maisons, sinon mois de zones, sinon éditions", () => {
  const parMaisons = periodeRepli(
    index({ maisons: { donnees: true, nbLignes: 2, periode: { du: "2019-03-05", au: "2021-07-31" } } })
  );
  assert.deepEqual(parMaisons, { du: "05/03/2019", au: "31/07/2021" });

  const parZones = periodeRepli(
    index({ zones: { donnees: true, nbEntrees: 4, mois: ["2024-11", "2025-01"] } })
  );
  assert.deepEqual(parZones, { du: "01/11/2024", au: "31/01/2025" });

  // Dernier jour de février tient compte des années bissextiles.
  const bissextile = periodeRepli(
    index({ zones: { donnees: true, nbEntrees: 1, mois: ["2024-02"] } })
  );
  assert.deepEqual(bissextile, { du: "01/02/2024", au: "29/02/2024" });

  const parEditions = periodeRepli(
    index({
      editions: {
        donnees: true,
        nbEditions: 2,
        editions: [
          { numero: 32, dateDebut: "2026-05-01", dateFin: "2026-05-07" },
          { numero: 31, dateDebut: "2026-02-01", dateFin: "2026-02-07" },
        ],
      },
    })
  );
  assert.deepEqual(parEditions, { du: "01/02/2026", au: "07/05/2026" });
});

test("periodeRepli : index vide ou bornes inexploitables -> null", () => {
  assert.equal(periodeRepli(index()), null);
  const incoherent = index({
    maisons: { donnees: true, nbLignes: 1, periode: { du: "2021-12-31", au: "2019-01-01" } },
  });
  assert.equal(periodeRepli(incoherent), null);
});

test("periodeInitiale : repli sur l'index seulement si l'année courante échoue", () => {
  const idx = index({ maisons: { donnees: true, nbLignes: 5, periode: { du: "2020-01-01", au: "2021-12-31" } } });
  assert.deepEqual(periodeInitiale(idx, new Date(NaN)), {
    du: "01/01/2020",
    au: "31/12/2021",
  });
  // Index absent et horloge KO : invitation explicite à choisir (null).
  assert.equal(periodeInitiale(null, new Date(NaN)), null);
});

// ---- 3. Validation des dates (refus des périodes inversées) ----

test("validerPeriodeFr : période valide, inversée, non calendaire ou absente", () => {
  const ok = validerPeriodeFr("01/02/2026", "28/02/2026");
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.periode, { du: "2026-02-01", au: "2026-02-28" });

  const inversee = validerPeriodeFr("28/02/2026", "01/02/2026");
  assert.equal(inversee.ok, false);
  assert.equal(inversee.erreur, MSG_PERIODE_INVALIDE);

  const nonCalendaire = validerPeriodeFr("01/02/2026", "31/02/2026");
  assert.equal(nonCalendaire.ok, false);
  assert.equal(nonCalendaire.erreur, MSG_PERIODE_INVALIDE);

  const vide = validerPeriodeFr("", "31/12/2026");
  assert.equal(vide.ok, false);
  assert.equal(vide.erreur, MSG_PERIODE_ABSENTE);
});

// ---- 4. Construction des paramètres de /api/banque/resume ----

test("urlResume : paramètres du/au normalisés ISO, conformes au contrat", () => {
  const v = validerPeriodeFr("01/06/2025", "30/06/2025");
  assert.equal(v.ok, true);
  assert.equal(urlResume(v.periode), "/api/banque/resume?du=2025-06-01&au=2025-06-30");
});

// ---- 5. États vides indépendants pour les trois sources ----

test("etatDonnees : état par section indépendant (vide, données, attente)", () => {
  assert.equal(etatDonnees(undefined), "attente");
  assert.equal(etatDonnees(null), "attente");
  assert.equal(etatDonnees(0), "vide");
  assert.equal(etatDonnees(7), "donnees");

  // Une section vide n'efface pas les autres.
  const rapport = { maisons: 0, zones: 3, editions: 0 };
  assert.deepEqual(
    Object.fromEntries(Object.entries(rapport).map(([k, n]) => [k, etatDonnees(n)])),
    { maisons: "vide", zones: "donnees", editions: "vide" }
  );
});

// ---- 6. Affichage des indicateurs sans recalcul métier ----

test("indicateurs : valeurs du moteur présentées telles quelles (aucun recalcul)", () => {
  const maisons = indicateursMaisons({
    nbLignes: 2,
    totalTempsMin: 90,
    totalParticipants: 5,
    totalCumulMin: 450,
  });
  assert.deepEqual(
    maisons.map((i) => i.valeur),
    [fmtNombre(2), fmtDureeBanque(90), fmtNombre(5), fmtDureeBanque(450)]
  );

  const zones = indicateursZones({
    nbEntrees: 3,
    totalTempsMin: 60,
    totalParticipants: 4,
    totalCumulMin: null, // cumul non calculable -> "—", jamais 0 inventé
    nbSansDuree: 1,
  });
  assert.deepEqual(
    zones.map((i) => i.valeur),
    [fmtNombre(3), fmtDureeBanque(60), fmtNombre(4), fmtDureeBanque(null), fmtNombre(1)]
  );
  assert.equal(zones[3].valeur, "—");

  const editions = indicateursEditions({
    nbEditions: 2,
    totalHeuresInvestiesMin: 180, // unité : minutes
    totalParticipantsParJours: 25,
    nbJoursParticipants: 7,
    nbMoyennePositive: 1, // zéro stocké n'est pas interprété ici
  });
  assert.deepEqual(
    editions.map((i) => i.valeur),
    [
      fmtNombre(2),
      fmtMinutesHeures(180),
      fmtNombre(25),
      fmtNombre(7),
      fmtNombre(1),
    ]
  );
  assert.equal(editions[1].valeur, "3 H 00 MN");
});

// ---- 7. Libellés des catégories A, B et C ----

test("catégories A/B/C : portée métier exacte (textes validés)", () => {
  assert.equal(
    AIDE_CATEGORIES.a,
    "Anomalies des données fournies au moteur. Elles ne constituent pas un inventaire exhaustif de toutes les anomalies présentes dans la base."
  );
  assert.equal(
    AIDE_CATEGORIES.b,
    "Anomalies des lignes retenues pour la période. Elles correspondent au sous-ensemble pertinent du rapport."
  );
  assert.equal(
    AIDE_CATEGORIES.c,
    "Données dont la période est indéterminable et leurs anomalies. Ces lignes ne sont pas comptées parmi les lignes retenues pour les agrégats de période."
  );
  assert.match(LIBELLES_CATEGORIES.a, /^A —/);
  assert.match(LIBELLES_CATEGORIES.b, /^B —/);
  assert.match(LIBELLES_CATEGORIES.c, /^C —/);
});

test("anomalies : détail lisible seul, UUID et références techniques masqués", () => {
  const uuid = "3f8b0c1d-1234-4abc-9def-001122334455";
  assert.equal(referenceLisible(uuid), null);
  assert.equal(referenceLisible("(sans référence)"), null);
  assert.equal(referenceLisible("édition n°12"), "édition n°12");
  assert.equal(referenceLisible(`${uuid} / 2026-03`), "2026-03");

  const an = { source: "editions", code: "moyenne-zero", reference: uuid, detail: "0 enregistré — peut correspondre à une donnée non renseignée (affiché tel quel, jamais recalculé)" };
  assert.equal(texteAnomalie(an), an.detail);

  const anEd = { source: "editions", code: "heures-investies-invalides", reference: "édition n°12", detail: "heures investies invalides : NaN" };
  assert.equal(texteAnomalie(anEd), "édition n°12 — heures investies invalides : NaN");

  const ligne = {
    source: "zones",
    reference: `${uuid} / abc`,
    anomalies: [{ source: "zones", code: "mois-invalide", reference: `${uuid} / abc`, detail: `mois non normalisé : "abc"` }],
  };
  const texte = texteNonEvaluable(ligne);
  assert.ok(texte.includes(`mois non normalisé : "abc"`));
  assert.ok(!texte.includes(uuid));
});

// ---- 8. Affichage initial limité à 50 anomalies, dépliage par lots ----

test("anomalies : plafond initial 50 puis lots de 50, plus rien au-delà du total", () => {
  assert.equal(LIMITE_ANOMALIES, 50);
  assert.equal(limiteSuivante(50, 120), 100);
  assert.equal(limiteSuivante(100, 120), 120); // dernier lot borné au total
  assert.equal(limiteSuivante(50, 60), 60);
  assert.equal(limiteSuivante(60, 60), 60); // jamais au-delà
  assert.equal(restants(120, 50), 70);
  assert.equal(restants(120, 120), 0);
  assert.equal(restants(30, 50), 0);
});

// ---- 9. Avertissement pour les périodes dépassant deux ans ----

test("depasseDeuxAns : règle exacte sur les dates réelles (bissextiles incluses)", () => {
  // Période par défaut d'une année civile : jamais d'avertissement.
  assert.equal(depasseDeuxAns("2026-01-01", "2026-12-31"), false);
  // Exactement deux ans : non dépassé ; un jour de plus : dépassé.
  assert.equal(depasseDeuxAns("2024-01-01", "2026-01-01"), false);
  assert.equal(depasseDeuxAns("2024-01-01", "2026-01-02"), true);
  assert.equal(depasseDeuxAns("2025-06-15", "2027-06-15"), false);
  assert.equal(depasseDeuxAns("2025-06-15", "2027-06-16"), true);
  //29 février -> anniversaire replié sur 28 février l'année non bissextile.
  assert.equal(depasseDeuxAns("2024-02-29", "2026-02-28"), false);
  assert.equal(depasseDeuxAns("2024-02-29", "2026-03-01"), true);
  // Mois plus long que février : jour anniversaire préservé.
  assert.equal(depasseDeuxAns("2024-01-31", "2026-01-30"), false);
  assert.equal(depasseDeuxAns("2024-01-31", "2026-02-01"), true);
  // Bornes non calendaires : pas d'avertissement.
  assert.equal(depasseDeuxAns("2024-02-31", "2027-03-01"), false);
  assert.equal(joursDuMois(2024, 2), 29);
  assert.equal(joursDuMois(2026, 2), 28);
  assert.equal(joursDuMois(2000, 2), 29); // %400
  assert.equal(joursDuMois(1900, 2), 28); // %100
});

// ---- 10. Redirection en cas de 401 ----

test("401 : genre identifié et destination de connexion exacte", async () => {
  const res = await appelerBanque("/api/banque/resume", async () =>
    reponse(401, { error: "Non authentifié." })
  );
  assert.equal(res.ok, false);
  assert.equal(res.genre, "401");
  assert.equal(LOGIN_BANQUE, "/login?next=/banque");
});

// ---- 11. Erreurs réseau, 400 et 500 ----

test("appelerBanque : réseau, 400 avec message utile, 500, 403, JSON inattendu", async () => {
  const reseau = await appelerBanque("/api/banque/index", async () => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(reseau, { ok: false, genre: "reseau", message: MSG_RESEAU });

  const d400 = await appelerBanque("/x", async () =>
    reponse(400, { error: MSG_PERIODE_INVALIDE })
  );
  assert.deepEqual(d400, { ok: false, genre: "400", message: MSG_PERIODE_INVALIDE });

  const d400sans = await appelerBanque("/x", async () => reponse(400, null));
  assert.equal(d400sans.ok, false);
  assert.equal(d400sans.genre, "400");

  const d500 = await appelerBanque("/x", async () =>
    reponse(500, { error: "Erreur de service." })
  );
  assert.deepEqual(d500, { ok: false, genre: "500", message: "Erreur de service." });

  const d403 = await appelerBanque("/x", async () => reponse(403, { error: "Interdit" }));
  assert.deepEqual(d403, { ok: false, genre: "403", message: MSG_403 });

  const corpsCasse = await appelerBanque("/x", async () => reponse(200, "<html>oops</html>"));
  assert.equal(corpsCasse.ok, false);
  assert.equal(corpsCasse.genre, "json");

  const ok = await appelerBanque("/x", async () => reponse(200, { unite: "test" }));
  assert.deepEqual(ok, { ok: true, donnees: { unite: "test" } });
});

// ---- 12. Carte Banque présente sur l'accueil ----

test("accueil : carte Banque des accomplissements vers /banque", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /href: "\/banque"/);
  assert.match(source, /Banque des accomplissements/);
});
