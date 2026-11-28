-- Migration FICHES-CIBLE : quantité cible par produit.
-- Base locale uniquement. Ne pas exécuter sur Neon/production.
-- Précondition : npm run db:check -> "OK : DATABASE_URL cible 127.0.0.1 (base locale)."

-- 0 = objectif non défini (le reste reste calculable, le manque est indéterminé).
DO $$ BEGIN
  ALTER TABLE "ProduitFiche" ADD COLUMN IF NOT EXISTS "quantiteCible" INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProduitFiche" ADD CONSTRAINT "ProduitFiche_quantiteCible_check"
    CHECK ("quantiteCible" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vérification :
-- SELECT column_name, column_default, is_nullable FROM information_schema.columns
--   WHERE table_name='ProduitFiche' AND column_name='quantiteCible';
-- SELECT conname FROM pg_constraint
--   WHERE conrelid='"ProduitFiche"'::regclass AND conname='ProduitFiche_quantiteCible_check';
-- SELECT COUNT(*) FROM "ProduitFiche"; -- valeurs existantes = 0

-- Retour arrière (si nécessaire, colonne sans données utilisateur) :
-- ALTER TABLE "ProduitFiche" DROP CONSTRAINT IF EXISTS "ProduitFiche_quantiteCible_check";
-- ALTER TABLE "ProduitFiche" DROP COLUMN IF EXISTS "quantiteCible";
