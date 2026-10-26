# Authentification et gestion des accès — UMPJ

**Version :** 1.0 — Mission S1  
**Périmètre :** application UMPJ existante (tous modules), avant développement de la Banque d'accomplissements.

---

## 1. Principes

- **Aucun accès anonyme** : toutes les pages et toutes les API sont protégées (sauf `/login` et les routes `/api/auth/*`, nécessaires à la connexion).
- **Deux rôles** :
  - **ADMIN** — accès complet aux modules existants (consultation, saisie, modification, suppression, import, export, téléchargement), à la gestion des utilisateurs (`/admin/utilisateurs`) et, plus tard, à la Banque.
  - **LECTEUR** — accès uniquement à la zone Banque (`/banque`, provisoirement une page « en préparation »). Toute écriture directe par un LECTEUR reçoit `403 Forbidden`.
- **Contrôles serveur** : `proxy.ts` (garde globale) **et** `requireAdmin()` dans chaque Route Handler. Masquer des boutons ne suffit pas — le contrôle est répété côté serveur.
- **Désactivation immédiate** : chaque requête vérifie en base que le compte est actif et que sa session n'a pas été révoquée (logout, désactivation, réinitialisation de mot de passe).

## 2. Mécanisme technique

| Élément | Choix |
|---|---|
| Garde globale | `proxy.ts` (convention Next.js 16, runtime Node) |
| Session | cookie `umpj_session` — `HttpOnly`, `Secure` (production), `SameSite=Lax`, chemin `/`, durée **12 heures** |
| Jeton | format `v1.<payload>.<signature>` — signature **HMAC-SHA-256** avec `AUTH_SECRET` (`node:crypto`), vérification en temps constant, contrôle d'expiration |
| Mots de passe | **scrypt** (`node:crypto`, N=16384, r=8, p=1, sel de 16 octets), format `scrypt$N$r$p$salt$hash` — jamais de clair, jamais dans les logs ni les réponses |
| Rôle | toujours relu depuis la table `Utilisateur` (le rôle du cookie n'est jamais une preuve) |
| CSRF | sur `/api/*` en méthode mutante : si l'en-tête `Origin` est présent, son hôte doit correspondre à la requête ; `Origin` absent accepté (clients non navigateur — `SameSite=Lax` bloque déjà les cookies cross-site) |
| Force brute | table `TentativeConnexion` : **5 échecs maximum / 15 minutes**, par email et par empreinte d'IP (HMAC de `X-Forwarded-For`, jamais l'IP en clair) ; réponses génériques (pas d'énumération d'utilisateurs) |
| En-têtes | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Permissions-Policy` (camera/microphone/geolocation/payment/usb gelés) (pas de CSP restrictive — non vérifiée sur l'existant) |

## 3. Schéma ajouté (tables de sécurité)

Ajoutées de façon **idempotente** par `scripts/init-db.mjs` :

- `Utilisateur` — id UUID, email unique, hash, rôle `ADMIN|LECTEUR`, actif, `sessions_invalides_apres`, horodatages.
- `TentativeConnexion` — clé (`email:…` ou `ip:…`), compteur, fenêtre de 15 minutes.
- `JournalAdmin` — journal des opérations administratives (connexion, création, désactivation… **jamais de secret**).

Aucune autre modification de schéma : aucune clé étrangère vers les tables métier.

## 4. Configuration (locale et Vercel)

1. Copiez `.env.example` en `.env` ; renseignez `DATABASE_URL`.
2. Générez `AUTH_SECRET` :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. Appliquez le schéma (localhost ou base cible) :
   ```bash
   node scripts/init-db.mjs
   ```
4. Sur **Vercel** (dashboard, à faire par le responsable du projet — aucune intervention automatisée) :
   - `DATABASE_URL` (déjà présent)
   - `AUTH_SECRET` (production **et** preview) — même secret que documenté en local si vous voulez des cookies partagés, sinon un secret distinct par environnement est préférable.

## 5. Création du premier administrateur (bootstrap)

> À exécuter **par un opérateur autorisé**, en local, avec un `.env` pointant vers la base cible. Aucun compte n'est créé automatiquement au démarrage de l'application.

```bash
node scripts/create-user.mjs
```

Le script : affiche l'**hôte** de la base cible, demande email, rôle (forcé `ADMIN` pour le premier compte), mot de passe **sans écho**, puis demande une confirmation écrite (`oui`) avant toute écriture. Il refuse les emails déjà présents.

**Création des comptes suivants :** depuis l'interface `/admin/utilisateurs` (réservée ADMIN) — création avec rôle explicite, désactivation/réactivation, réinitialisation de mot de passe.

## 6. Procédure de récupération d'accès (sans désactiver l'authentification)

Si plus aucun administrateur est en mesure de se connecter (mot de passe oublié, dernier admin désactivé par erreur, etc.) :

1. En local, avec un `.env` pointant vers la base concernée :
   ```bash
   node scripts/init-db.mjs    # si les tables n'existent pas encore
   node scripts/create-user.mjs
   ```
2. Créer un **nouveau** compte ADMIN avec un email et un mot de passe maîtrisés.
3. Se connecter sur `/login`, puis dans `/admin/utilisateurs` :
   - réinitialiser le mot de passe du compte d'origine,
   - réactiver les comptes nécessaires,
   - désactiver le compte de secours s'il n'est plus utile.

**Interdiction opérationnelle :** `AUTH_GARDE=off` n'est pas une procédure de récupération. Ce levier rouvre l'application entière (statut d'avant-S1) et ne doit être utilisé qu'en incident documenté, le temps d'appliquer la procédure ci-dessus. Il est **sans effet en production** (`NODE_ENV=production`) : la garde y reste toujours active.

## 7. Journal et révocation

- Chaque connexion, déconnexion et opération d'administration est journalisée dans `JournalAdmin` (acteur, action, cible, détails non sensibles).
- La déconnexion met à jour `sessions_invalides_apres` : le jeton devient invalide **côté serveur**, y compris sur un autre appareil.
- La désactivation d'un compte et la réinitialisation d'un mot de passe révoquent également toutes les sessions du compte concerné.

## 8. Garde-fous anti-verrouillage

- Un utilisateur ne peut **pas** désactiver son propre compte.
- Un administrateur ne peut **pas** se retirer lui-même le rôle ADMIN.
- On ne peut **pas** désactiver ni rétrograder le **dernier administrateur actif**.

## 9. Checklist avant mise en production

- [ ] `AUTH_SECRET` défini dans Vercel (production et preview) — 32 octets aléatoires minimum.
- [ ] `node scripts/init-db.mjs` exécuté sur la base cible (tables `Utilisateur`, `TentativeConnexion`, `JournalAdmin` présentes).
- [ ] Premier ADMIN créé via `scripts/create-user.mjs` (ou compte existant migré).
- [ ] Test : navigation anonyme sur `/` ⇒ redirection `/login`.
- [ ] Test : `POST /api/lignes` anonyme ⇒ `401`.
- [ ] Test : connexion ADMIN ⇒ modules fonctionnels ; création d'un LECTEUR ⇒ `/banque` seulement ; écriture LECTEUR ⇒ `403`.
- [ ] Page `/login` accessible sans cookie ; assets (`/logo.png`, `/icon.png`) chargés.
- [ ] Sauvegarde de `AUTH_SECRET` en lieu sûr (rotation = invalidation de toutes les sessions).

## 10. Limites connues et acceptées (S1)

- La session n'a pas de liste de révocation individuelle par appareil (la révocation est globale au compte).
- La limitation par IP est **best effort** (l'en-tête `X-Forwarded-For` est défini par la plateforme mais repose sur la confiance ; la limitation par email est la barrière robuste).
- Pas de double authentification (2FA) — hors périmètre S1.
- Pas de CSP restrictive (risque de casser les ressources existantes) — à étudier dans une mission dédiée.
- Le mot de passe réinitialisé par un admin est connu de l'admin le temps du transfert : le destinataire doit le changer (à documenter dans l'usage).
