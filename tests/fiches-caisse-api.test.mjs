// Tests statiques des routes de caisse — lecture de source uniquement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const routes = [
  "app/api/fiches/depenses/route.ts",
  "app/api/fiches/depenses/[id]/route.ts",
  "app/api/fiches/ventes/[id]/route.ts",
  "app/api/fiches/caisse/route.ts",
  "app/api/fiches/caisse/historique/route.ts",
];
const src = (f) => readFileSync(f, "utf8");

test("routes de caisse présentes et protégées", () => {
  for (const f of routes) {
    assert.ok(existsSync(f), `${f} absent`);
    const s = src(f);
    assert.ok(s.includes("requireAdmin"), `${f} : requireAdmin manquant`);
    assert.ok(s.includes("if (acces instanceof NextResponse) return acces"), `${f} : garde manquante`);
  }
});

test("mutations financières sous verrou et transaction", () => {
  for (const f of [
    "app/api/fiches/depenses/route.ts",
    "app/api/fiches/depenses/[id]/route.ts",
    "app/api/fiches/ventes/[id]/route.ts",
  ]) {
    const s = src(f);
    assert.ok(s.includes("avecVerrouCaisse"), `${f} : helper de verrou absent`);
    assert.ok(s.includes("lireJsonBorne"), `${f} : corps non borné`);
  }
  const helper = src("lib/fiches-caisse.ts");
  assert.ok(helper.includes("BEGIN") && helper.includes("COMMIT") && helper.includes("ROLLBACK"), "transaction absente");
  assert.ok(helper.includes('LOCK TABLE "DepenseFiche", "VenteFiche" IN SHARE ROW EXCLUSIVE MODE'), "verrou absent");
});

test("aucun solde négatif accepté", () => {
  const dep = src("app/api/fiches/depenses/route.ts");
  assert.ok(dep.includes("soldeDisponible"), "contrôle du solde à la création");
  assert.ok(dep.includes("status: 409"), "refus 409 si solde insuffisant");
  const modif = src("app/api/fiches/depenses/[id]/route.ts");
  assert.ok(modif.includes("delta > 0"), "contrôle de l'augmentation");
  const ventes = src("app/api/fiches/ventes/[id]/route.ts");
  assert.ok(ventes.includes("soldeApres < 0"), "contrôle sur correction de vente");
  assert.ok(ventes.includes("totaux.soldeDisponible - ancien.rows[0].montant < 0"), "contrôle sur suppression de vente");
});

test("création de vente jamais bloquée par la caisse", () => {
  const s = src("app/api/fiches/ventes/route.ts");
  assert.ok(!s.includes("avecVerrouCaisse"), "aucun contrôle de solde à la création");
  assert.ok(!s.includes("soldeDisponible"), "aucun solde dans la route POST vente");
  assert.ok(s.includes("journaliser"), "journalisation conservée");
});

test("montant calculé côté serveur, jamais accepté du client", () => {
  for (const f of ["app/api/fiches/ventes/route.ts", "app/api/fiches/ventes/[id]/route.ts"]) {
    const s = src(f);
    assert.ok(s.includes("calculerMontant(quantite, prixUnitaire)"), `${f} : calcul serveur absent`);
    assert.ok(!s.includes("b.montant"), `${f} : montant client accepté`);
  }
});

test("historique dérivé, aucune recette inventée", () => {
  const h = src("app/api/fiches/caisse/historique/route.ts");
  assert.ok(h.includes('type: "vente"') || h.includes("construireHistorique"), "ventes intégrées");
  assert.ok(h.includes("construireHistorique"), "historique dérivé");
  const helper = src("lib/fiches-caisse.ts");
  assert.ok(helper.includes("soldeApres"), "solde après opération");
  assert.ok(!helper.includes('type: "ajustement"'), "aucune entrée artificielle");
});

test("traçabilité des corrections dans JournalAdmin", () => {
  for (const f of [
    "app/api/fiches/depenses/[id]/route.ts",
    "app/api/fiches/ventes/[id]/route.ts",
  ]) {
    const s = src(f);
    assert.ok(s.includes("journaliserCaisse"), `${f} : journalisation absente`);
    assert.ok(s.includes("fiche_depense_modification") || s.includes("fiche_vente_modification"), `${f} : action de correction absente`);
  }
});

test("schéma : table DepenseFiche et contraintes", () => {
  const sql = src("scripts/migration-fiches-depenses.sql");
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "DepenseFiche"'));
  assert.ok(sql.includes('CHECK ("montant" > 0)'));
  assert.ok(sql.includes("'impression', 'papier', 'transport', 'fournitures', 'communication', 'entretien', 'autres'"));
  assert.ok(!sql.includes('"produitId"'), "aucune relation avec un produit");
  assert.ok(src("scripts/init-db.mjs").includes('CREATE TABLE IF NOT EXISTS "DepenseFiche"'));
});
