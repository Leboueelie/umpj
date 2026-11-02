-- Migration P4.1 : table RapportGenere (historique des rapports consolidés).
-- Base locale uniquement. Ne pas exécuter sur Neon/production.
-- Précondition : npm run db:check -> "OK : DATABASE_URL cible 127.0.0.1 (base locale)."

CREATE TABLE IF NOT EXISTS "RapportGenere" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "titre" TEXT NOT NULL,
  "typeRapport" TEXT NOT NULL,
  "modules" TEXT[] NOT NULL,
  "periodeDu" DATE,
  "periodeAu" DATE,
  "filtres" JSONB NOT NULL DEFAULT '{}',
  "dateGeneration" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "auteurId" UUID,
  "auteurLibelle" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
  "format" TEXT NOT NULL,
  "pdfData" BYTEA,
  "pdfTaille" INTEGER,
  "pdfSha256" TEXT,
  "xlsxData" BYTEA,
  "xlsxTaille" INTEGER,
  "xlsxSha256" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'genere',
  CONSTRAINT "RapportGenere_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RapportGenere_typeRapport_check" CHECK ("typeRapport" IN ('consolide')),
  CONSTRAINT "RapportGenere_format_check" CHECK ("format" IN ('pdf', 'xlsx', 'both')),
  CONSTRAINT "RapportGenere_statut_check" CHECK ("statut" = 'genere'),
  CONSTRAINT "RapportGenere_auteurId_fkey" FOREIGN KEY ("auteurId")
    REFERENCES "Utilisateur" ("id") ON DELETE SET NULL,
  -- Cohérence format / fichiers
  CONSTRAINT "RapportGenere_format_fichiers_check" CHECK (
    ("format" = 'pdf'  AND "pdfData" IS NOT NULL AND "xlsxData" IS NULL) OR
    ("format" = 'xlsx' AND "xlsxData" IS NOT NULL AND "pdfData" IS NULL) OR
    ("format" = 'both' AND "pdfData" IS NOT NULL AND "xlsxData" IS NOT NULL)
  ),
  -- Cohérence métadonnées PDF
  CONSTRAINT "RapportGenere_pdf_meta_check" CHECK (
    ("pdfData" IS NULL AND "pdfTaille" IS NULL AND "pdfSha256" IS NULL) OR
    ("pdfData" IS NOT NULL AND "pdfTaille" IS NOT NULL AND "pdfSha256" IS NOT NULL)
  ),
  -- Cohérence métadonnées XLSX
  CONSTRAINT "RapportGenere_xlsx_meta_check" CHECK (
    ("xlsxData" IS NULL AND "xlsxTaille" IS NULL AND "xlsxSha256" IS NULL) OR
    ("xlsxData" IS NOT NULL AND "xlsxTaille" IS NOT NULL AND "xlsxSha256" IS NOT NULL)
  )
);

-- Index pour la pagination et la recherche
CREATE INDEX IF NOT EXISTS "RapportGenere_dateGeneration_idx"
  ON "RapportGenere" ("dateGeneration" DESC, "id");

CREATE INDEX IF NOT EXISTS "RapportGenere_auteurId_idx"
  ON "RapportGenere" ("auteurId");

CREATE INDEX IF NOT EXISTS "RapportGenere_modules_idx"
  ON "RapportGenere" USING GIN ("modules");

CREATE INDEX IF NOT EXISTS "RapportGenere_periode_idx"
  ON "RapportGenere" ("periodeDu", "periodeAu");

-- Vérification :
-- \d "RapportGenere"
-- SELECT COUNT(*) FROM "RapportGenere"; -- doit être 0

-- Retour arrière (si nécessaire, uniquement si la table est vide) :
-- DROP TABLE IF EXISTS "RapportGenere";
