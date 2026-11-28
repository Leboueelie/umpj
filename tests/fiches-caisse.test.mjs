// Tests purs de la caisse du module Fiches — aucune base, aucun réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerSolde, construireHistorique } from "../lib/fiches-caisse.ts";
import { validerDepense, calculerMontant, CATEGORIES_DEPENSE } from "../lib/fiches-calc.ts";

const vente = (id, montant, date, createdAt = date) => ({
  id,
  produitId: "p",
  produitNom: "Fiche test",
  quantite: 1,
  prixUnitaire: montant,
  montant,
  dateVente: date,
  vendeur: "Claire",
  observation: "",
  auteurId: null,
  createdAt,
});

const depense = (id, montant, date, createdAt = date) => ({
  id,
  motif: "Impression",
  montant,
  dateDepense: date,
  responsable: "Elie",
  categorie: "impression",
  observation: "",
  auteurId: null,
  createdAt,
  updatedAt: createdAt,
});

test("calculerSolde : ventes − dépenses, jamais de stock", () => {
  assert.equal(calculerSolde(0, 0), 0);
  assert.equal(calculerSolde(25000, 0), 25000);
  assert.equal(calculerSolde(25000, 5000), 20000);
  assert.equal(calculerSolde(5000, 5000), 0);
});

test("validerDepense : champs obligatoires et catégorie", () => {
  assert.deepEqual(validerDepense({
    motif: "Papier", montant: 5000, dateDepense: "2026-01-10",
    responsable: "Elie", categorie: "papier",
  }), []);
  assert.ok(validerDepense({ motif: "", montant: 10, dateDepense: "2026-01-10", responsable: "E", categorie: "papier" }).length > 0);
  assert.ok(validerDepense({ motif: "X", montant: 0, dateDepense: "2026-01-10", responsable: "E", categorie: "papier" }).length > 0);
  assert.ok(validerDepense({ motif: "X", montant: -1, dateDepense: "2026-01-10", responsable: "E", categorie: "papier" }).length > 0);
  assert.ok(validerDepense({ motif: "X", montant: 10, dateDepense: "2026-13-10", responsable: "E", categorie: "papier" }).length > 0);
  assert.ok(validerDepense({ motif: "X", montant: 10, dateDepense: "2026-01-10", responsable: "", categorie: "papier" }).length > 0);
  assert.ok(validerDepense({ motif: "X", montant: 10, dateDepense: "2026-01-10", responsable: "E", categorie: "inconnue" }).length > 0);
  assert.equal(CATEGORIES_DEPENSE.length, 7);
});

test("calculerMontant : montant de vente entier", () => {
  assert.equal(calculerMontant(10, 2500), 25000);
});

test("construireHistorique : solde après chaque opération", () => {
  const h = construireHistorique(
    [vente("v1", 25000, "2026-01-01")],
    [depense("d1", 5000, "2026-01-02")]
  );
  // Affichage : plus récent d'abord.
  assert.deepEqual(h.map((m) => [m.type, m.soldeApres]), [
    ["depense", 20000],
    ["vente", 25000],
  ]);
  assert.equal(h[0].entree, 0);
  assert.equal(h[0].sortie, 5000);
  assert.equal(h[1].entree, 25000);
});

test("construireHistorique : aucune vente → solde nul", () => {
  assert.deepEqual(construireHistorique([], []), []);
  const h = construireHistorique([], [depense("d", 100, "2026-01-01")]);
  assert.equal(h[0].soldeApres, -100); // cas théorique refusé à l'écriture
});

test("construireHistorique : ordre déterministe en cas de date identique", () => {
  const h = construireHistorique(
    [vente("v", 100, "2026-01-01", "2026-01-01T10:00:00Z")],
    [depense("d", 40, "2026-01-01", "2026-01-01T09:00:00Z")]
  );
  assert.equal(h[0].type, "vente"); // créé après -> affiché avant
  assert.equal(h[0].soldeApres, 60);
  assert.equal(h[1].soldeApres, -40);
});
