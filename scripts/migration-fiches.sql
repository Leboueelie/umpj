-- Migration FICHES : productions et ventes de fiches UMPJ.
-- Base locale uniquement. Ne pas exécuter sur Neon/production.
-- Précondition : npm run db:check -> "OK : DATABASE_URL cible 127.0.0.1 (base locale)."

-- Catalogue dynamique (aucun produit codé en dur dans l'application).
CREATE TABLE IF NOT EXISTS "ProduitFiche" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nom" TEXT NOT NULL,
  "prixUnitaire" INTEGER NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ProduitFiche_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProduitFiche_prixUnitaire_check" CHECK ("prixUnitaire" >= 0)
);

DO $$ BEGIN
  CREATE UNIQUE INDEX "ProduitFiche_nom_normalise_key"
    ON "ProduitFiche" (lower(regexp_replace(trim("nom"), '\s+', ' ', 'g')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Historique des productions (enregistrements multiples autorisés).
CREATE TABLE IF NOT EXISTS "ProductionFiche" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "produitId" UUID NOT NULL,
  "quantite" INTEGER NOT NULL,
  "dateProduction" DATE NOT NULL,
  "responsable" TEXT NOT NULL,
  "observation" TEXT NOT NULL DEFAULT '',
  "auteurId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ProductionFiche_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionFiche_quantite_check" CHECK ("quantite" > 0),
  CONSTRAINT "ProductionFiche_produitId_fkey" FOREIGN KEY ("produitId")
    REFERENCES "ProduitFiche" ("id") ON DELETE RESTRICT,
  CONSTRAINT "ProductionFiche_auteurId_fkey" FOREIGN KEY ("auteurId")
    REFERENCES "Utilisateur" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "ProductionFiche_date_idx"
  ON "ProductionFiche" ("dateProduction" DESC, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ProductionFiche_produitId_idx"
  ON "ProductionFiche" ("produitId");

-- Historique des ventes : prix appliqué historisé, montant calculé côté serveur.
-- Aucune contrainte entre quantités produites et vendues (pas de gestion de stock).
CREATE TABLE IF NOT EXISTS "VenteFiche" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "produitId" UUID NOT NULL,
  "quantite" INTEGER NOT NULL,
  "prixUnitaire" INTEGER NOT NULL,
  "montant" INTEGER NOT NULL,
  "dateVente" DATE NOT NULL,
  "vendeur" TEXT NOT NULL,
  "observation" TEXT NOT NULL DEFAULT '',
  "auteurId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "VenteFiche_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VenteFiche_quantite_check" CHECK ("quantite" > 0),
  CONSTRAINT "VenteFiche_prixUnitaire_check" CHECK ("prixUnitaire" >= 0),
  CONSTRAINT "VenteFiche_montant_check" CHECK ("montant" >= 0),
  CONSTRAINT "VenteFiche_produitId_fkey" FOREIGN KEY ("produitId")
    REFERENCES "ProduitFiche" ("id") ON DELETE RESTRICT,
  CONSTRAINT "VenteFiche_auteurId_fkey" FOREIGN KEY ("auteurId")
    REFERENCES "Utilisateur" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "VenteFiche_date_idx"
  ON "VenteFiche" ("dateVente" DESC, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "VenteFiche_produitId_idx"
  ON "VenteFiche" ("produitId");
CREATE INDEX IF NOT EXISTS "VenteFiche_vendeur_idx"
  ON "VenteFiche" ("vendeur");

-- Produits initiaux (données, pas du code), insertion idempotente.
INSERT INTO "ProduitFiche" (id, nom, "prixUnitaire", description, actif)
SELECT gen_random_uuid(), v.nom, v.prix, '', true
FROM (VALUES
  ('Ministère de Jeûne complet', 25),
  ('But quinquennal – Chant', 25),
  ('Hymne du But quinquennal', 50)
) AS v(nom, prix)
WHERE NOT EXISTS (
  SELECT 1 FROM "ProduitFiche" p
  WHERE lower(regexp_replace(trim(p."nom"), '\s+', ' ', 'g'))
      = lower(regexp_replace(trim(v.nom), '\s+', ' ', 'g'))
);

-- Vérification :
-- SELECT nom, "prixUnitaire", actif FROM "ProduitFiche" ORDER BY nom;
-- SELECT COUNT(*) FROM "ProductionFiche"; SELECT COUNT(*) FROM "VenteFiche";

-- Retour arrière (si nécessaire, uniquement si les tables sont vides) :
-- DROP TABLE IF EXISTS "VenteFiche";
-- DROP TABLE IF EXISTS "ProductionFiche";
-- DROP TABLE IF EXISTS "ProduitFiche";
