// Tests purs du module FICHES (productions et ventes de fiches).
// Exécution : node --test tests/fiches-calc.test.mjs
// Aucune base, aucun réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliserTexte,
  entierPositif,
  entierNonNegatif,
  dateIso,
  dateAffichage,
  calculerMontant,
  formaterFcfa,
  cleNomProduit,
  normaliserVendeur,
  validerProduit,
  validerProduction,
  validerVente,
  dansPeriode,
  cumuls,
} from "../lib/fiches-calc.ts";

test("normaliserTexte : trim + collapse espaces", () => {
  assert.equal(normaliserTexte("  But   quinquennal  –  Chant  "), "But quinquennal – Chant");
  assert.equal(normaliserTexte(null), "");
});

test("entierPositif / entierNonNegatif", () => {
  assert.equal(entierPositif("12"), 12);
  assert.equal(entierPositif(0), null);
  assert.equal(entierPositif("-3"), null);
  assert.equal(entierPositif("1.5"), null);
  assert.equal(entierNonNegatif(0), 0);
  assert.equal(entierNonNegatif("25"), 25);
  assert.equal(entierNonNegatif("-1"), null);
});

test("dateIso : formats et calendrier", () => {
  assert.equal(dateIso("2026-02-28"), "2026-02-28");
  assert.equal(dateIso("2024-02-29"), "2024-02-29");
  assert.equal(dateIso("2026-02-29"), null);
  assert.equal(dateIso("2026-13-01"), null);
  assert.equal(dateIso("28/02/2026"), null);
  assert.equal(dateIso(" 2026-02-28 "), "2026-02-28");
});

test("dateAffichage : ISO PostgreSQL → AAAA-MM-JJ", () => {
  assert.equal(dateAffichage("2026-11-27T00:00:00.000Z"), "2026-11-27");
  assert.equal(dateAffichage("2026-02-28"), "2026-02-28");
  assert.equal(dateAffichage(null), "—");
});

test("calculerMontant : quantite × prix, entier FCFA", () => {
  assert.equal(calculerMontant(10, 25), 250);
  assert.equal(calculerMontant(3, 50), 150);
  assert.equal(calculerMontant(1, 0), 0);
});

test("formaterFcfa : groupement et suffixe", () => {
  assert.equal(formaterFcfa(1250), "1 250 FCFA");
  assert.equal(formaterFcfa(25), "25 FCFA");
});

test("cleNomProduit : casse et espaces ignorés, accents conservés", () => {
  assert.equal(cleNomProduit("  Hymne   du BUT  "), cleNomProduit("hymne du but"));
  assert.notEqual(cleNomProduit("Élie"), cleNomProduit("Elie"));
});

test("normaliserVendeur : saisie libre, casse préservée", () => {
  assert.equal(normaliserVendeur("  Yao   Divine  "), "Yao Divine");
  assert.equal(normaliserVendeur(""), "");
});

test("validerProduit : nom, prix, description", () => {
  assert.deepEqual(validerProduit({ nom: "Fiche test", prixUnitaire: 25 }), []);
  assert.ok(validerProduit({ nom: "   ", prixUnitaire: 25 }).length > 0);
  assert.ok(validerProduit({ nom: "Fiche", prixUnitaire: -1 }).length > 0);
  assert.ok(validerProduit({ nom: "Fiche", prixUnitaire: "abc" }).length > 0);
  assert.ok(validerProduit({ nom: "Fiche", prixUnitaire: 25, description: "x".repeat(501) }).length > 0);
});

test("validerProduction : champs obligatoires et quantité positive", () => {
  const valide = {
    produitId: "id", quantite: 5, dateProduction: "2026-02-28", responsable: "Elie",
  };
  assert.deepEqual(validerProduction(valide), []);
  assert.ok(validerProduction({ ...valide, quantite: 0 }).length > 0);
  assert.ok(validerProduction({ ...valide, responsable: "  " }).length > 0);
  assert.ok(validerProduction({ ...valide, dateProduction: "2026-02-30" }).length > 0);
});

test("validerVente : prix historisé et vendeur libre", () => {
  const valide = {
    produitId: "id", quantite: 2, prixUnitaire: 50, dateVente: "2026-02-28", vendeur: "Yao Divine",
  };
  assert.deepEqual(validerVente(valide), []);
  assert.ok(validerVente({ ...valide, vendeur: "" }).length > 0);
  assert.ok(validerVente({ ...valide, prixUnitaire: -1 }).length > 0);
  assert.ok(validerVente({ ...valide, quantite: 0 }).length > 0);
});

test("dansPeriode : bornes inclusives et filtres optionnels", () => {
  assert.equal(dansPeriode("2026-02-28", "2026-02-01", "2026-02-28"), true);
  assert.equal(dansPeriode("2026-03-01", "2026-02-01", "2026-02-28"), false);
  assert.equal(dansPeriode("2026-03-01", null, null), true);
});

test("cumuls : quantités et montant, sans notion de stock", () => {
  const productions = [{ quantite: 10 }, { quantite: 5 }];
  const ventes = [{ quantite: 3, montant: 75 }, { quantite: 2, montant: 50 }];
  assert.deepEqual(cumuls(productions, ventes), {
    quantiteProduite: 15,
    quantiteVendue: 5,
    montantVentes: 125,
  });
});
