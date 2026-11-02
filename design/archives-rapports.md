# Archives des rapports — règles de conservation (P4.5)

> Documentation technique concise. Aucune logique applicative n'est modifiée par ce document.

## Principe

Une archive (`RapportGenere`) est créée par une opération `POST` autorisée à `ADMIN`.

Elle conserve ensemble et de façon immuable :

- les métadonnées (titre, modules, période, filtres, date de génération, auteur) ;
- l'instantané JSONB des données exactes utilisées (`snapshot`, version `schemaVersion`) ;
- les fichiers PDF et/ou Excel originaux (`pdfData`/`xlsxData`), leur taille et leur SHA-256.

## Règles

1. **Création** : `POST /api/rapports/historique` (ADMIN uniquement). Validation stricte des modules et des dates. Lecture seule sur les données métier. Insertion transactionnelle d'une seule ligne complète.
2. **Immuabilité applicative** : aucune route `UPDATE`, `PUT`, `PATCH` ou `DELETE` n'existe pour les archives. Le téléchargement historique sert les octets stockés, jamais un recalcul.
3. **Intégrité** : avant tout téléchargement, la taille réelle et le SHA-256 sont recalculés et comparés aux valeurs enregistrées. Toute incohérence bloque le téléchargement (erreur explicite, pas de correction silencieuse).
4. **Consultation** : réservée à ADMIN (`requireAdmin` + proxy). Anonyme → 401, LECTEUR → 403.
5. **Auteur** : `auteurId` (UUID, nullable si le compte est supprimé) + `auteurLibelle` (snapshot du nom au moment de la génération). Les archives restent consultables même si le compte auteur est désactivé.
6. **Fichiers** : stockés en `BYTEA` dans PostgreSQL (cohérent avec `Jeune`/`Proclamation`/`ActionDeGrace`), jamais sur disque, jamais exposés par chemin.
7. **Statut** : `genere` uniquement (archives complètes). Pas de statut `partiel`/`echec`.
8. **Protection DB** : aucune contrainte absolue contre l'accès SQL direct (superuser) ; la protection est applicative. Un trigger d'immuabilité est reporté à une mission ultérieure si nécessaire.
9. **Traçabilité** : `JournalAdmin` peut enregistrer les opérations (acteur = UUID).

## Ce qui n'est pas protégé

- Un accès SQL privilégié (superuser) peut modifier ou supprimer une ligne. La protection applicative ne couvre pas ce cas.
- Les sauvegardes/restaurations de la base peuvent restaurer d'anciennes versions.
- Aucune politique de rétention n'est définie en v1.

## Fichiers concernés

- `app/api/rapports/historique/route.ts` (GET liste + POST archivage)
- `app/api/rapports/historique/[id]/route.ts` (GET détail)
- `app/api/rapports/historique/[id]/pdf/route.ts` (GET téléchargement PDF)
- `app/api/rapports/historique/[id]/xlsx/route.ts` (GET téléchargement XLSX)
- `app/rapports/historique/page.tsx` (interface)
- `scripts/migration-p4.1-rapport-genere.sql` + `scripts/init-db.mjs` (schéma)
- `lib/rapport-consolide.ts`, `lib/rapport-consolide-pdf.ts`, `lib/rapport-consolide-xlsx.ts` (générateurs réutilisés)
