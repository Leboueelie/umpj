-- Migration FRONT-39/FRONT-41 : connexion par nom complet.
-- Base locale uniquement. Ne pas exécuter sur Neon/production.
-- Précondition : npm run db:check -> "OK : DATABASE_URL cible 127.0.0.1 (base locale)."

-- 1. Ajout de la colonne nom (nullable, pour préserver les comptes existants).
ALTER TABLE "Utilisateur" ADD COLUMN IF NOT EXISTS "nom" TEXT;

-- 2. L'e-mail n'est plus l'identifiant de connexion : il devient facultatif
--    (conservé pour les communications et l'audit). La contrainte UNIQUE
--    reste en place (les NULL sont distincts en PostgreSQL).
ALTER TABLE "Utilisateur" ALTER COLUMN "email" DROP NOT NULL;

-- 3. Index unique fonctionnel sur le nom normalisé.
--    - trim + collapse des espaces + minuscules ;
--    - accents conservés (pas d'unaccent) ;
--    - les NULL sont distincts en PostgreSQL : les comptes sans nom coexistent.
DO $$ BEGIN
  CREATE UNIQUE INDEX "Utilisateur_nom_normalise_key"
    ON "Utilisateur" (lower(regexp_replace(trim("nom"), '\s+', ' ', 'g')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vérification :
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'Utilisateur' AND column_name IN ('nom','email');
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Utilisateur' AND indexname = 'Utilisateur_nom_normalise_key';

-- Retour arrière (si nécessaire) :
-- DROP INDEX IF EXISTS "Utilisateur_nom_normalise_key";
-- ALTER TABLE "Utilisateur" ALTER COLUMN "email" SET NOT NULL;
-- ALTER TABLE "Utilisateur" DROP COLUMN IF EXISTS "nom";
