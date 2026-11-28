-- Migration FICHES-CAISSE : table des dépenses de la caisse.
-- Base locale uniquement. Ne pas exécuter sur Neon/production.
-- Précondition : npm run db:check -> "OK : DATABASE_URL cible 127.0.0.1 (base locale)."

-- Aucune dépense n'est rattachée à un produit : le solde provient
-- exclusivement des ventes réelles enregistrées dans "VenteFiche".
CREATE TABLE IF NOT EXISTS "DepenseFiche" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "motif" TEXT NOT NULL,
  "montant" INTEGER NOT NULL,
  "dateDepense" DATE NOT NULL,
  "responsable" TEXT NOT NULL,
  "categorie" TEXT NOT NULL,
  "observation" TEXT NOT NULL DEFAULT '',
  "auteurId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "DepenseFiche_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DepenseFiche_montant_check" CHECK ("montant" > 0),
  CONSTRAINT "DepenseFiche_categorie_check" CHECK ("categorie" IN
    ('impression', 'papier', 'transport', 'fournitures', 'communication', 'entretien', 'autres')),
  CONSTRAINT "DepenseFiche_auteurId_fkey" FOREIGN KEY ("auteurId")
    REFERENCES "Utilisateur" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "DepenseFiche_date_idx"
  ON "DepenseFiche" ("dateDepense" DESC, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DepenseFiche_categorie_idx"
  ON "DepenseFiche" ("categorie");

-- Vérification :
-- SELECT COUNT(*) FROM "DepenseFiche";
-- SELECT conname FROM pg_constraint WHERE conrelid='"DepenseFiche"'::regclass;

-- Retour arrière (si nécessaire, table vide) :
-- DROP TABLE IF EXISTS "DepenseFiche";
