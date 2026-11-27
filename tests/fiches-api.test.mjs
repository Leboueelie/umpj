// Tests statiques des handlers du module FICHES.
// Les handlers Next.js ne sont pas importables en node:test (alias @/, next/server) :
// on vérifie leur source. Aucun accès base, aucune écriture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const routes = [
  "app/api/fiches/produits/route.ts",
  "app/api/fiches/produits/[id]/route.ts",
  "app/api/fiches/productions/route.ts",
  "app/api/fiches/ventes/route.ts",
  "app/api/fiches/stats/route.ts",
  "app/api/fiches/statistiques/route.ts",
  "app/api/fiches/vendeurs/route.ts",
];

const src = (f) => readFileSync(f, "utf8");
const tous = routes.map(src).join("\n");

test("toutes les routes fiches existent", () => {
  for (const f of routes) assert.ok(existsSync(f), `${f} absent`);
});

test("chaque route vérifie requireAdmin", () => {
  for (const f of routes) {
    const s = src(f);
    assert.ok(s.includes("requireAdmin"), `${f} : requireAdmin manquant`);
    assert.ok(s.includes("if (acces instanceof NextResponse) return acces"), `${f} : garde manquante`);
  }
});

test("les mutations lisent le corps de façon bornée", () => {
  for (const f of [
    "app/api/fiches/produits/route.ts",
    "app/api/fiches/produits/[id]/route.ts",
    "app/api/fiches/productions/route.ts",
    "app/api/fiches/ventes/route.ts",
  ]) {
    const s = src(f);
    assert.ok(s.includes("lireJsonBorne"), `${f} : lireJsonBorne manquant`);
    assert.ok(s.includes("LIMITE_JSON"), `${f} : limite manquante`);
    assert.ok(s.includes("if (!lecture.ok)"), `${f} : gestion d'erreur manquante`);
    assert.ok(!s.includes("await req.json()"), `${f} : req.json() brut interdit`);
  }
});

test("validation avant écriture et codes HTTP", () => {
  const post = src("app/api/fiches/ventes/route.ts");
  assert.ok(post.includes("validerVente"), "validation vente");
  assert.ok(post.includes("status: 400"), "400 sur validation");
  assert.ok(post.includes("status: 404"), "404 produit introuvable");
  assert.ok(post.includes("status: 409"), "409 produit désactivé");
  assert.ok(post.includes("status: 201"), "201 création");
  const prod = src("app/api/fiches/productions/route.ts");
  assert.ok(prod.includes("validerProduction"), "validation production");
});

test("aucun produit n'est codé en dur dans l'application", () => {
  // Les noms de produits ne doivent apparaître que dans les données initiales
  // (init-db.mjs / migration-fiches.sql), jamais dans le code applicatif.
  for (const f of [...routes, "lib/fiches.ts", "lib/fiches-calc.ts"]) {
    const s = src(f);
    assert.ok(!s.includes("Ministère de Jeûne complet"), `${f} : produit codé en dur`);
    assert.ok(!s.includes("But quinquennal"), `${f} : produit codé en dur`);
  }
  assert.ok(src("scripts/migration-fiches.sql").includes("Ministère de Jeûne complet"), "seed présent dans la migration");
  assert.ok(src("scripts/init-db.mjs").includes("Ministère de Jeûne complet"), "seed présent dans init-db");
});

test("le prix de vente est historisé et le montant calculé côté serveur", () => {
  const s = src("app/api/fiches/ventes/route.ts");
  assert.ok(s.includes('"prixUnitaire"'), "colonne prixUnitaire insérée");
  assert.ok(/INSERT INTO "VenteFiche"[\s\S]*?montant/.test(s), "colonne montant insérée");
  assert.ok(s.includes("calculerMontant(quantite, prixUnitaire)"), "calcul serveur du montant");
  assert.ok(!s.includes("b.montant"), "le montant du client n'est jamais accepté");
});

test("aucune contrainte de stock ni blocage sur les quantités", () => {
  const s = tous + src("scripts/migration-fiches.sql");
  assert.ok(!s.includes("quantiteProduite <"), "pas de comparaison stock/vente");
  assert.ok(!s.includes("quantiteVendue >"), "pas de blocage de vente");
  assert.ok(!s.includes('CREATE TABLE "Stock'), "aucune table de stock");
  assert.ok(!s.includes('"stockRestant"'), "aucune colonne de stock restant");
  assert.ok(!s.includes("UNIQUE (\"produitId\""), "enregistrements multiples autorisés");
});

test("les vendeurs sont une saisie libre avec suggestions", () => {
  const vendeurs = src("app/api/fiches/vendeurs/route.ts");
  assert.ok(vendeurs.includes('GROUP BY "vendeur"'), "vendeurs uniques pour suggestions");
  const vente = src("app/api/fiches/ventes/route.ts");
  assert.ok(vente.includes("normaliserVendeur"), "saisie libre normalisée");
  assert.ok(!vente.includes("Utilisateur"), "aucun compte utilisateur requis pour un vendeur");
});

test("requêtes paramétrées (aucune valeur interpolée)", () => {
  assert.ok(tous.includes("$1"), "paramètres SQL");
  assert.ok(!tous.includes("`${produitId}`"), "pas d'interpolation de valeur");
});
