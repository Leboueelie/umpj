// Tests du moteur Banque (B2 / B2-F). Exécution : `node --test tests/*.test.mjs`
// PRÉREQUIS : Node.js >= 22.18 (type stripping natif des fichiers .ts).
// Aucune dépendance (node:test / node:assert uniquement) — voir le rapport B2-F.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  estDateIsoCalendaire,
  estMoisYm,
  estPeriodeValide,
  normaliserPeriode,
  normaliserDateSql,
  normaliserEditionSql,
  statutLigne,
  statutMois,
  statutEdition,
  filtrerLignes,
  filtrerEntrees,
  filtrerEditions,
  agregerMaisons,
  agregerZones,
  agregerEditions,
  detecterAnomaliesMaisons,
  detecterAnomaliesZones,
  detecterAnomaliesEditions,
  fmtDureeBanque,
  fmtMinutesHeures,
  fmtNombre,
  construireRapportBanque,
} from "../lib/banque.ts";

// ---- Fabriques de données ----

const ligne = (over = {}) => ({
  id: "l-1",
  cahierId: "c-1",
  date: "2026-02-17",
  heureDebut: "08:00",
  heureFin: "10:00",
  nombrePersonnes: 3,
  ...over,
});

const entree = (over = {}) => ({
  id: "e-1",
  zoneId: "z-1",
  mois: "2026-02",
  tempsMis: 120,
  participants: 4,
  ...over,
});

const edition = (over = {}) => ({
  id: "ed-1",
  numero: 31,
  reference: "RAPPORT UMPJ-CI 001/2026",
  dateDebut: "2026-02-17",
  dateFin: "2026-02-22",
  libellePeriode: "17 au 22 Février 2026",
  delegationsPresentes: 1,
  regionsSpirituelles: 1,
  missionnaires1: 0,
  missionnaires2: 0,
  anciensAbidjan: 0,
  epousesAnciensAbidjan: 0,
  moyenneParticipation: 120,
  heuresInvesties: 145,
  delegationsExterieures: [],
  abidjanZones: [],
  interieurLocalites: [],
  participantsParJour: [{ jour: "1er jour", date: "17 02 2026", participants: 100 }],
  sessions: [],
  createdAt: "2026-02-23T00:00:00.000Z",
  updatedAt: "2026-02-23T00:00:00.000Z",
  ...over,
});

const P = { du: "2026-02-01", au: "2026-02-28" };

function freezeDeep(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freezeDeep(v);
  }
  return o;
}

// ---- Période : normalisation et validation ----

test("normaliserPeriode : bornes acceptées en JJ/MM/AAAA et ISO, triées", () => {
  assert.deepEqual(normaliserPeriode("01/02/2026", "2026-02-28"), {
    du: "2026-02-01",
    au: "2026-02-28",
  });
  assert.deepEqual(normaliserPeriode("2026-02-28", "2026-02-01"), null, "du > au refusé");
  assert.equal(normaliserPeriode("31/02/2026", "2026-02-28"), null, "date calendaire invalide refusée");
  assert.equal(normaliserPeriode("abc", "2026-02-28"), null, "borne illisible refusée");
});

test("estDateIsoCalendaire / estMoisYm : domaine exact", () => {
  assert.equal(estDateIsoCalendaire("2024-02-29"), true, "année bissextile");
  assert.equal(estDateIsoCalendaire("2025-02-29"), false);
  assert.equal(estDateIsoCalendaire("2025-02-31"), false);
  assert.equal(estDateIsoCalendaire("25/08/2025"), false);
  assert.equal(estMoisYm("2026-02"), true);
  assert.equal(estMoisYm("2026-13"), false);
  assert.equal(estMoisYm("2026-00"), false);
});

// ---- Precondition : periode normalisee (B2-F reserve 7) ----

test("estPeriodeValide / construireRapportBanque : periode non normalisee refusee", () => {
  assert.equal(estPeriodeValide(P), true);
  assert.equal(estPeriodeValide({ du: "01/02/2026", au: "2026-02-28" }), false, "format saisi non normalise");
  assert.equal(estPeriodeValide({ du: "2026-02-28", au: "2026-02-01" }), false, "inversee");
  assert.equal(estPeriodeValide({ du: "2026-02-31", au: "2026-02-28" }), false, "non calendaire");
  const sources = { lignes: [ligne()], entrees: [], editions: [] };
  assert.throws(
    () => construireRapportBanque(sources, { du: "01/02/2026", au: "2026-02-28" }),
    Error,
    "jamais un rapport silencieusement valide sur periode brute"
  );
  assert.throws(() => construireRapportBanque(sources, { du: "2026-02-28", au: "2026-02-01" }), Error);
});

// ---- Bornes inclusives (maisons) ----

test("statutLigne : bornes de période inclusives", () => {
  assert.equal(statutLigne("2026-02-01", P), "inclus", "jour = du");
  assert.equal(statutLigne("2026-02-28", P), "inclus", "jour = au");
  assert.equal(statutLigne("2026-01-31", P), "exclus", "jour avant du");
  assert.equal(statutLigne("2026-03-01", P), "exclus", "jour après au");
  assert.equal(statutLigne("25/08/2025", P), "invalide", "format non ISO => non évaluable");
});

// ---- Mois partiellement couverts (zones) ----

test("statutMois : mois touchant la période même partiellement sont inclus", () => {
  const p = { du: "2026-01-15", au: "2026-03-10" };
  assert.equal(statutMois("2026-01", p), "inclus", "mois de du, couvert partiellement");
  assert.equal(statutMois("2026-02", p), "inclus", "mois entierement dans la periode");
  assert.equal(statutMois("2026-03", p), "inclus", "mois de au, couvert partiellement");
  assert.equal(statutMois("2025-12", p), "exclus");
  assert.equal(statutMois("2026-04", p), "exclus");
  assert.equal(statutMois("2026-13", p), "invalide");
});

// ---- Éditions : chevauchement d'intervalle ----

test("statutEdition : chevauchements inclusifs et cas invalides", () => {
  assert.equal(statutEdition("2026-01-10", "2026-02-10", P), "inclus", "se termine le jour de du");
  assert.equal(statutEdition("2026-02-25", "2026-03-20", P), "inclus", "commence dans la periode, fin apres");
  assert.equal(statutEdition("2026-01-01", "2026-01-31", P), "exclus", "entierement avant");
  assert.equal(statutEdition("2026-03-01", "2026-03-31", P), "exclus", "entierement apres");
  assert.equal(statutEdition("2026-02-28", "2026-04-01", P), "inclus", "debut = au");
  assert.equal(statutEdition("2026-02-20", "2026-02-10", P), "invalide", "periode inversee");
  assert.equal(statutEdition("20/02/2026", "2026-02-22", P), "invalide", "debut non ISO");
});

// ---- Filtres : rien de perdu silencieusement ----

test("filtrerLignes : date non ISO classee anormale, jamais perdue", () => {
  const lignes = [
    ligne({ id: "ok", date: "2026-02-17" }),
    ligne({ id: "hors", date: "2026-01-05" }),
    ligne({ id: "battu", date: "25/08/2025" }),
  ];
  const { retenues, anormales } = filtrerLignes(lignes, P);
  assert.deepEqual(retenues.map((l) => l.id), ["ok"]);
  assert.deepEqual(anormales.map((l) => l.id), ["battu"], "non évaluable, exposee separement");
});

test("filtrerEntrees / filtrerEditions : memes garanties", () => {
  const fe = filtrerEntrees(
    [entree({ id: "a", mois: "2026-02" }), entree({ id: "b", mois: "2026-01" }), entree({ id: "c", mois: "2026-13" })],
    P
  );
  assert.deepEqual(fe.retenues.map((e) => e.id), ["a"]);
  assert.deepEqual(fe.anormales.map((e) => e.id), ["c"]);

  const fed = filtrerEditions(
    [edition({ numero: 1 }), edition({ numero: 2, dateDebut: "2026-01-01", dateFin: "2026-01-31" }), edition({ numero: 3, dateFin: "2026-02-28" })],
    P
  );
  assert.deepEqual(fed.retenues.map((e) => e.numero), [1, 3]);
  assert.equal(fed.anormales.length, 0, "aucune periode inversee ici");
});

// ---- Calculs de duree et de cumul (RG1 / RG2) ----

test("agregerMaisons : RG1 passage minuit et RG2 cumul", () => {
  const lignes = [
    ligne({ id: "nuit", heureDebut: "22:00", heureFin: "06:00", nombrePersonnes: 3 }),
    ligne({ id: "jour", heureDebut: "08:00", heureFin: "09:30", nombrePersonnes: 2 }),
  ];
  const a = agregerMaisons(lignes);
  assert.equal(a.nbLignes, 2);
  assert.equal(a.totalTempsMin, 480 + 90, "22:00->06:00 = 480 min");
  assert.equal(a.totalParticipants, 5);
  assert.equal(a.totalCumulMin, 480 * 3 + 90 * 2, "cumul = temps x participants par ligne");
});

test("agregerMaisons : heure illisible exclue des sommes et signalee", () => {
  const lignes = [ligne({ id: "battu", heureDebut: "25:00", heureFin: "26:00" }), ligne({ id: "ok" })];
  const a = agregerMaisons(lignes);
  assert.equal(a.totalTempsMin, 120, "seule la ligne valide compte en duree");
  assert.equal(a.totalCumulMin, 360, "cumul identique a B2 : jamais calcule sur horaire illisible");
  assert.equal(a.totalParticipants, 6, "B2-F 1 : participants valides comptes meme si horaires invalides");
  const codes = detecterAnomaliesMaisons(lignes).map((x) => x.code);
  assert.ok(codes.includes("heure-invalide"), "anomalie signalee");
});

test("agregerMaisons : aucun cumul calculable => totalCumulMin null", () => {
  assert.equal(agregerMaisons([]).totalCumulMin, null);
  const a = agregerMaisons([ligne({ nombrePersonnes: 0 })]);
  assert.equal(a.totalCumulMin, null, "participants invalides : pas de cumul invente");
  assert.equal(a.totalParticipants, 0);
});

test("agregerZones : regle 1 — participants comptes sans duree ; regle 2 — pas de cumul sans duree", () => {
  const a = agregerZones([entree({ tempsMis: null, participants: 5 })]);
  assert.equal(a.nbEntrees, 1);
  assert.equal(a.nbSansDuree, 1);
  assert.equal(a.totalParticipants, 5, "regle 1 : participants valides comptes malgre la duree absente");
  assert.equal(a.totalTempsMin, 0);
  assert.equal(a.totalCumulMin, null, "regle 2 : cumul seulement si les deux valeurs disponibles");
});

test("agregerZones : duree presente et participants absents/invalides", () => {
  const a = agregerZones([
    entree({ id: "a", participants: 0 }),
    entree({ id: "b", participants: -2 }),
    entree({ id: "c", participants: 3 }),
  ]);
  assert.equal(a.totalTempsMin, 120 * 3, "toutes les durees valides comptent dans le temps");
  assert.equal(a.totalParticipants, 3, "seuls les participants valides (>= 1) sont comptes");
  assert.equal(a.totalCumulMin, 120 * 3, "cumul uniquement pour la ligne avec participants valides");
  const codes = detecterAnomaliesZones([entree({ participants: -2 })]).map((x) => x.code);
  assert.ok(codes.includes("participants-invalides"));
});

test("agregerZones : duree zero et duree absente", () => {
  const a = agregerZones([entree({ tempsMis: 0, participants: 2 })]);
  assert.equal(a.totalCumulMin, 0, "duree 0 exploitables => cumul 0, distinct de null");
  assert.equal(a.nbSansDuree, 0);
  const codes = detecterAnomaliesZones([entree({ tempsMis: null })]).map((x) => x.code);
  assert.ok(codes.includes("duree-absente"), "durée manquante signalée, jamais corrigée");
});

// ---- Éditions : sommes de valeurs enregistrees, aucun cumul invente ----

test("agregerEditions : heures investies converties depuis les minutes", () => {
  const a = agregerEditions([
    edition({ numero: 1, heuresInvesties: 120 }),
    edition({ numero: 2, heuresInvesties: 60 }),
  ]);
  assert.equal(a.nbEditions, 2);
  assert.equal(a.totalHeuresInvestiesMin, 180);
  assert.equal(fmtMinutesHeures(a.totalHeuresInvestiesMin), "3 H 00 MN");
});

test("agregerEditions : aucune clé de cumul temps x participants (regle 2)", () => {
  const a = agregerEditions([edition()]);
  assert.deepEqual(Object.keys(a).sort(), [
    "nbEditions",
    "nbJoursParticipants",
    "nbMoyennePositive",
    "totalHeuresInvestiesMin",
    "totalParticipantsParJours",
  ]);
});

test("agregerEditions : moyenne jamais recalculee, valeurs invalides signalees", () => {
  const a = agregerEditions([
    edition({ numero: 1, moyenneParticipation: 0, heuresInvesties: -5, participantsParJour: [] }),
    edition({ numero: 2, moyenneParticipation: 90, heuresInvesties: 30, participantsParJour: [] }),
  ]);
  assert.equal(a.nbMoyennePositive, 1, "zero n'est pas une moyenne positive (fait, sans interpretation)");
  assert.equal(a.totalHeuresInvestiesMin, 30, "valeur negative exclue des sommes");
  assert.equal(a.totalParticipantsParJours, null, "aucun jour enregistre");
  const codes = detecterAnomaliesEditions([
    edition({ numero: 1, moyenneParticipation: 0, heuresInvesties: -5 }),
  ]).map((x) => x.code);
  assert.ok(codes.includes("moyenne-zero"));
  assert.ok(codes.includes("heures-investies-invalides"));
});

test("detecterAnomaliesEditions : periode inversee et numero en doublon", () => {
  const codes = detecterAnomaliesEditions([
    edition({ numero: 31, dateDebut: "2026-02-22", dateFin: "2026-02-17" }),
    edition({ numero: 31, id: "ed-2" }),
  ]).map((x) => x.code);
  assert.ok(codes.includes("periode-invalide"));
  assert.ok(codes.includes("numero-en-doublon"));
});

// ---- Formatage ----

test("fmtDureeBanque / fmtMinutesHeures / fmtNombre : valeurs absentes -> em dash", () => {
  assert.equal(fmtDureeBanque(1440), "24h00");
  assert.equal(fmtDureeBanque(0), "0h00");
  assert.equal(fmtDureeBanque(null), "—");
  assert.equal(fmtDureeBanque(undefined), "—");
  assert.equal(fmtDureeBanque(-30), "—", "B2-F : duree negative jamais affichee");
  assert.equal(fmtMinutesHeures(145), "2 H 25 MN");
  assert.equal(fmtMinutesHeures(0), "0 H 00 MN");
  assert.equal(fmtMinutesHeures(null), "—");
  assert.equal(fmtMinutesHeures(-5), "—", "B2-F : minutes negatives jamais affichees");
  assert.equal(fmtNombre(12), "12");
  assert.equal(fmtNombre(null), "—");
  assert.equal(fmtNombre(NaN), "—");
});

// ---- Dates non normalisees ----

test("detecterAnomaliesMaisons : dates non normalisées et non calendaires", () => {
  const codes = detecterAnomaliesMaisons([
    ligne({ id: "a", date: "25/08/2025" }),
    ligne({ id: "b", date: "2025-02-31" }),
    ligne({ id: "c", date: "2025-02-28" }),
  ]).map((x) => x.code);
  assert.ok(codes.includes("date-non-normalee"));
  assert.equal(codes.filter((c) => c === "date-non-normalee").length, 2, "les deux formats fautifs signales");
});

// ---- Frontière PostgreSQL : Date du pilote pg -> jour civil (B2-F) ----

test("normaliserDateSql : ISO preservee, Date locale, cas invalides", () => {
  assert.equal(normaliserDateSql("2026-02-17"), "2026-02-17", "chaine ISO calendaire preservee");
  assert.equal(normaliserDateSql("25/08/2025"), null, "format saisi non accepte ici");
  assert.equal(normaliserDateSql("2025-02-31"), null, "non calendaire");
  assert.equal(normaliserDateSql(new Date(2026, 1, 17)), "2026-02-17", "minuit local (forme produite par pg)");
  assert.equal(normaliserDateSql(new Date(2026, 1, 17, 13, 45)), "2026-02-17", "jour civil local preserve");
  assert.equal(normaliserDateSql(new Date(NaN)), null, "Date invalide");
  assert.equal(normaliserDateSql(new Date("banana")), null);
  assert.equal(normaliserDateSql(42), null);
  assert.equal(normaliserDateSql(null), null);
});

test("normaliserDateSql : jour civil independant du fuseau horaire (sous-processus TZ)", () => {
  // Le pilote pg construit ses DATE a minuit local ; l'extraction par getters
  // locaux doit rendre le meme jour dans n'importe quel fuseau (jamais
  // toISOString ni getUTC*, qui decaleaient le jour hors UTC).
  const moduleUrl = new URL("../lib/banque.ts", import.meta.url).href;
  const script = `
const { normaliserDateSql } = await import(${JSON.stringify(moduleUrl)});
const d1 = new Date(2026, 1, 17);
const d2 = new Date(2026, 1, 17, 13, 45);
const d3 = new Date(2026, 0, 1);
process.stdout.write([d1, d2, d3].map((d) => normaliserDateSql(d)).join(","));
`;
  const attendu = "2026-02-17,2026-02-17,2026-01-01";
  for (const tz of ["UTC", "America/New_York", "Pacific/Kiritimati"]) {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });
    assert.equal(out, attendu, `fuseau ${tz} : meme jour civil`);
  }
});

test("normaliserEditionSql / filtrerEditions : dates pg Date normalisees avant le moteur", () => {
  const brut = edition({ numero: 7, dateDebut: new Date(2026, 1, 17), dateFin: new Date(2026, 1, 22) });
  const n = normaliserEditionSql(brut);
  assert.deepEqual(n, { dateDebut: "2026-02-17", dateFin: "2026-02-22" });
  assert.ok(brut.dateDebut instanceof Date, "aucune mutation de l'objet source");

  const sansNormalisation = filtrerEditions([brut], P);
  assert.equal(sansNormalisation.retenues.length, 0, "Date pg brute -> non exploitable, signalee");
  assert.equal(sansNormalisation.anormales.length, 1, "jamais perdue silencieusement");

  const normalise = { ...brut, ...n };
  const fl = filtrerEditions([normalise], P);
  assert.equal(fl.retenues.length, 1, "apres normalisation : retenue");
  assert.equal(fl.anormales.length, 0);

  const cas = normaliserEditionSql(edition({ numero: 8, dateDebut: "25/08/2025", dateFin: new Date(NaN) }));
  assert.deepEqual(cas, { dateDebut: null, dateFin: null }, "valeur non normalisable -> null, origine intacte");
});

// ---- Contrat d'anomalies A / B / C (B2-F) ----

test("contrat A/B/C : categories distinctes, B sous-ensemble de A", () => {
  const r = construireRapportBanque(
    {
      lignes: [
        ligne({ id: "ok", date: "2026-02-10", nombrePersonnes: -1 }), // valeur invalide, retenue
        ligne({ id: "battu", date: "25/08/2025" }), // periode indeterminable -> C
        ligne({ id: "hors", date: "2026-01-05", nombrePersonnes: -1 }), // hors periode, valeur invalide
      ],
      entrees: [entree({ mois: "2026-13" })], // C zones
      editions: [],
    },
    P
  );
  // A : sur toutes les donnees fournies
  const aRefs = r.maisons.anomaliesDisponibles.map((a) => `${a.reference}:${a.code}`);
  assert.ok(aRefs.includes("ok:participants-invalides"));
  assert.ok(aRefs.includes("battu:date-non-normalee"));
  assert.ok(aRefs.includes("hors:participants-invalides"), "A porte aussi les lignes hors periode");
  // B : lignes retenues seulement
  const bRefs = r.maisons.anomaliesPeriode.map((a) => `${a.reference}:${a.code}`);
  assert.deepEqual(bRefs, ["ok:participants-invalides"], "B = anomalies des seules lignes retenues");
  // C : periode indeterminable, conservee avec ses propres anomalies
  assert.equal(r.maisons.nonEvaluables.length, 1);
  const c = r.maisons.nonEvaluables[0];
  assert.equal(c.reference, "battu");
  assert.ok(c.anomalies.some((a) => a.code === "date-non-normalee"));
  assert.ok(
    !r.maisons.anomaliesPeriode.some((a) => a.reference === "battu"),
    "une ligne de C n'entre jamais dans B"
  );
  // B sous-ensemble stricte de A (memes codes/references)
  const setA = new Set(aRefs);
  for (const refB of bRefs) assert.ok(setA.has(refB), `B (${refB}) doit exister dans A`);
  // Zones : mois invalide -> C
  assert.equal(r.zones.nonEvaluables.length, 1);
  assert.ok(r.zones.nonEvaluables[0].anomalies.some((a) => a.code === "mois-invalide"));
  assert.equal(r.zones.anomaliesPeriode.length, 0);
  assert.ok(r.zones.anomaliesDisponibles.some((a) => a.code === "mois-invalide"), "A le signale quand meme");
});

test("contrat B : doublons recomptes sur le sous-ensemble retenu, jamais exclus ni fusionnes", () => {
  const r = construireRapportBanque(
    {
      lignes: [],
      entrees: [],
      editions: [
        edition({ numero: 31, id: "ed-1" }),
        edition({ numero: 31, id: "ed-2" }),
        edition({ numero: 31, id: "ed-3", dateDebut: "2026-05-01", dateFin: "2026-05-31" }), // hors periode
      ],
    },
    P
  );
  assert.equal(r.editions.nbRetenues, 2, "les deux copies retenues sont comptees, jamais fusionnees");
  assert.equal(r.editions.agregat.nbEditions, 2, "agregat sur les copies retenues telles quelles");
  assert.equal(r.editions.agregat.totalHeuresInvestiesMin, 145 * 2, "valeurs cumulees sans deduplication");
  assert.ok(r.editions.anomaliesDisponibles.some((a) => a.code === "numero-en-doublon"), "A : doublon sur les 3");
  assert.ok(
    r.editions.anomaliesPeriode.some((a) => a.code === "numero-en-doublon" && a.detail.includes("2 fois")),
    "B : doublon recompte sur le seul sous-ensemble retenu"
  );
});

test("moyenne zero : formule exacte non categorique, moyenne invalide separee", () => {
  const zero = detecterAnomaliesEditions([edition({ numero: 1, moyenneParticipation: 0 })]).find(
    (a) => a.code === "moyenne-zero"
  );
  assert.ok(zero, "code moyenne-zero");
  assert.ok(
    zero.detail.includes("0 enregistré — peut correspondre à une donnée non renseignée"),
    "formule exacte de la decision 3"
  );

  const codes = (m) => detecterAnomaliesEditions([edition({ numero: 2, moyenneParticipation: m })]).map((a) => a.code);
  assert.ok(codes(NaN).includes("moyenne-invalide"));
  assert.ok(codes("120").includes("moyenne-invalide"));
  assert.ok(codes(-5).includes("moyenne-invalide"));
  assert.deepEqual(codes(0), ["moyenne-zero"]);
  assert.deepEqual(codes(0.5), [], "moyenne petite mais positive : aucune anomalie");
  assert.deepEqual(codes(120), [], "moyenne valide : aucun signalement");
});

// ---- Rapport : pas de double comptage, pas de total general ----

test("construireRapportBanque : sections independantes, sans total general", () => {
  const sources = { lignes: [ligne()], entrees: [entree()], editions: [edition()] };
  const r1 = construireRapportBanque(sources, P);
  assert.equal(r1.maisons.nbRetenues, 1);
  assert.equal(r1.zones.nbRetenues, 1);
  assert.equal(r1.editions.nbRetenues, 1);
  assert.equal("totalGeneral" in r1, false, "aucun total inter-modules trompeur");

  const r2 = construireRapportBanque({ ...sources, lignes: [ligne(), ligne({ id: "l-2" })] }, P);
  assert.equal(r2.maisons.nbRetenues, 2, "les nouvelles lignes modifient les maisons");
  assert.deepEqual(r2.zones.agregat, r1.zones.agregat, "les zones sont inchangees : pas de double comptage");
  assert.deepEqual(r2.editions.agregat, r1.editions.agregat, "les editions sont inchangees");
});

test("construireRapportBanque : agregats et anomalies par section", () => {
  const r = construireRapportBanque(
    {
      lignes: [ligne({ id: "battu", date: "25/08/2025" }), ligne({ id: "ok" })],
      entrees: [entree({ tempsMis: null })],
      editions: [edition()],
    },
    P
  );
  assert.equal(r.maisons.nbTotal, 2);
  assert.equal(r.maisons.nbRetenues, 1, "la date battue n'est pas dans les agregats");
  assert.equal(r.maisons.nonEvaluables.length, 1, "exposee comme non evaluable (categorie C)");
  assert.equal(r.maisons.nonEvaluables[0].reference, "battu");
  assert.equal(r.maisons.agregat.nbLignes, 1);
  assert.ok(r.maisons.anomaliesDisponibles.some((a) => a.code === "date-non-normalee"), "A : sur toutes les donnees");
  assert.equal(
    r.maisons.anomaliesPeriode.some((a) => a.code === "date-non-normalee"),
    false,
    "B : hors periode, la ligne battue n'est pas dans les anomalies de periode"
  );
  assert.equal(r.zones.agregat.nbSansDuree, 1);
  assert.ok(r.zones.anomaliesPeriode.some((a) => a.code === "duree-absente"), "entree retenue => en B egalement");
  assert.ok(r.zones.anomaliesDisponibles.some((a) => a.code === "duree-absente"));
  assert.equal(r.editions.agregat.totalHeuresInvestiesMin, 145);
});

// ---- Non-mutation des objets sources ----

test("aucune mutation des objets sources (entrees gelées)", () => {
  const sources = freezeDeep({
    lignes: [ligne(), ligne({ id: "l-2", date: "25/08/2025" })],
    entrees: [entree(), entree({ id: "e-2", mois: "2026-01", tempsMis: null })],
    editions: [edition(), edition({ numero: 31, id: "ed-2" })],
  });
  const periode = freezeDeep({ ...P });
  const avant = structuredClone({ ...sources, periode });
  const r = construireRapportBanque(sources, periode);
  assert.ok(r);
  assert.deepEqual(structuredClone({ ...sources, periode }), avant, "donnees sources intactes");
  // Les fonctions individuelles aussi :
  assert.ok(agregerMaisons(sources.lignes));
  assert.ok(agregerZones(sources.entrees));
  assert.ok(agregerEditions(sources.editions));
  assert.ok(filtrerLignes(sources.lignes, periode));
  assert.ok(detecterAnomaliesZones(sources.entrees));
});
