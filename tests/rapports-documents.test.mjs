// Tests déterministes (sans base) du rapport Documents.
// Mock d'un pool pg dont query() filtre par createdAt selon les bornes ISO.
import { test } from "node:test";
import assert from "node:assert/strict";

// Données de test : 3 sources, documents avant/pendant/après la période.
const DOCS = [
  // Jeune
  { src: "Jeune", categorie: "nation", taille: 100, createdAt: "2025-12-15" },
  { src: "Jeune", categorie: "ministere", taille: 200, createdAt: "2026-01-05" },
  { src: "Jeune", categorie: "nation", taille: 300, createdAt: "2026-01-20" },
  { src: "Jeune", categorie: "ministere", taille: 400, createdAt: "2026-02-10" },
  // Proclamation
  { src: "Proclamation", categorie: "comite", taille: 50, createdAt: "2025-12-20" },
  { src: "Proclamation", categorie: "region", taille: 150, createdAt: "2026-01-10" },
  { src: "Proclamation", categorie: "comite", taille: 250, createdAt: "2026-02-05" },
  // ActionDeGrace
  { src: "ActionDeGrace", categorie: "comite", taille: 75, createdAt: "2026-01-01" },
  { src: "ActionDeGrace", categorie: "region", taille: 175, createdAt: "2026-01-31" },
  { src: "ActionDeGrace", categorie: "comite", taille: 275, createdAt: "2026-02-15" },
];

function mockPool() {
  return {
    async query(sql, params) {
      const du = params?.[0] ?? null;
      const au = params?.[1] ?? null;
      const hasPeriod = du !== null && au !== null;
      let src = null;
      if (sql.includes('"Jeune"')) src = "Jeune";
      else if (sql.includes('"Proclamation"')) src = "Proclamation";
      else if (sql.includes('"ActionDeGrace"')) src = "ActionDeGrace";
      const filtered = DOCS.filter((d) => {
        if (d.src !== src) return false;
        if (!hasPeriod) return true;
        return d.createdAt >= du && d.createdAt <= au;
      });
      // Group by category
      const groups = new Map();
      for (const d of filtered) {
        const cat = d.src === "Jeune"
          ? (d.categorie || "(sans catégorie)")
          : (d.categorie || "(sans type)");
        if (!groups.has(cat)) groups.set(cat, { fichiers: 0, octets: 0 });
        groups.get(cat).fichiers += 1;
        groups.get(cat).octets += d.taille;
      }
      const rows = [...groups.entries()].map(([categorie, v]) => ({
        categorie,
        fichiers: v.fichiers,
        octets: v.octets,
      })).sort((a, b) => a.categorie.localeCompare(b.categorie));
      return { rows };
    },
  };
}

test("documents : totaux cohérents avec le détail (période)", async () => {
  const { construireRapport } = await import("../lib/rapports.ts");
  const pool = mockPool();
  const rapport = await construireRapport(pool, "documents", "2026-01-01", "2026-01-31");
  // Détail : somme des fichiers et octets du tableau
  const detailFichiers = rapport.tableau.lignes.reduce((a, l) => a + (l[2]), 0);
  // Vérifier volumesExamines = somme du détail
  assert.equal(rapport.volumesExamines, detailFichiers);
  // Vérifier indicateur fichiers = volumesExamines
  const indFichiers = rapport.indicateurs.find((i) => i.libelle.includes("Fichiers"));
  assert.equal(indFichiers.valeur, String(detailFichiers));
  // Vérifier que le détail ne contient que des documents dans la période
  // (5 Jeune: jan 5, jan 20 + 1 Proclamation jan 10 + 2 ActionDeGrace jan 1, jan 31 = 8)
  assert.equal(detailFichiers, 5);
});

test("documents : bornes inclusives", async () => {
  const { construireRapport } = await import("../lib/rapports.ts");
  const pool = mockPool();
  // 2026-01-01 et 2026-01-31 doivent être inclus
  const rapport = await construireRapport(pool, "documents", "2026-01-01", "2026-01-31");
  const categories = rapport.tableau.lignes.map((l) => l[1]);
  // ActionDeGrace jan 1 et jan 31 inclus
  assert.ok(rapport.volumesExamines >= 2, "au moins les 2 bornes incluses");
  // Vérifier le total exact : 8 documents dans la période
  assert.equal(rapport.volumesExamines, 5);
});

test("documents : période vide", async () => {
  const { construireRapport } = await import("../lib/rapports.ts");
  const pool = mockPool();
  const rapport = await construireRapport(pool, "documents", "2025-06-01", "2025-06-30");
  assert.equal(rapport.volumesExamines, 0);
  assert.equal(rapport.tableau.lignes.length, 0);
  const indFichiers = rapport.indicateurs.find((i) => i.libelle.includes("Fichiers"));
  assert.equal(indFichiers.valeur, "0");
});

test("documents : sans bornes → tous les documents", async () => {
  const { construireRapport } = await import("../lib/rapports.ts");
  const pool = mockPool();
  const rapport = await construireRapport(pool, "documents", null, null);
  assert.equal(rapport.volumesExamines, DOCS.length);
  const indFichiers = rapport.indicateurs.find((i) => i.libelle.includes("Fichiers"));
  assert.equal(indFichiers.valeur, String(DOCS.length));
});

test("documents : trois sources présentes dans le détail", async () => {
  const { construireRapport } = await import("../lib/rapports.ts");
  const pool = mockPool();
  const rapport = await construireRapport(pool, "documents", "2026-01-01", "2026-01-31");
  const modules = new Set(rapport.tableau.lignes.map((l) => l[0]));
  assert.ok(modules.has("Jeûne"), "Jeûne présent");
  assert.ok(modules.has("Proclamation"), "Proclamation présent");
  assert.ok(modules.has("Actions de grâce"), "Actions de grâce présent");
});
