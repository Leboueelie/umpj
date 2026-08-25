# Cahier des charges
## Application de gestion des registres de temps de prière

**Version :** 1.0
**Date :** 24/08/2026
**Statut :** Validation du prototype en cours

---

## 1. Contexte et objet du document

Actuellement, le suivi des temps de prière se fait à la main dans des cahiers papier quadrillés. Chaque cahier contient plusieurs sessions (une par date), avec pour chacune : une plage horaire, un nombre de personnes présentes, et un calcul manuel du temps mis et du cumul. Ces calculs manuels sont source d'erreurs, difficiles à consolider, et ne permettent pas d'obtenir rapidement une vue d'ensemble (total par cahier, historique, export).

Ce document décrit les besoins fonctionnels et techniques d'une application web destinée à remplacer cette saisie papier, en conservant la logique métier existante (notion de cahier, de ligne, de cumul) tout en automatisant les calculs et en centralisant les données.

---

## 2. Objectifs du projet

- Supprimer les calculs manuels (temps mis, cumul) source d'erreurs
- Permettre à plusieurs personnes de saisir depuis des postes différents, sans dépendre d'un cahier physique unique
- Conserver la structure connue et déjà utilisée : **plusieurs cahiers**, chacun avec ses lignes et son total
- Permettre l'export des données au format Excel, pour archivage ou transmission
- Poser une base simple, qui pourra évoluer vers une version plus robuste (base de données dédiée, sauvegardes, historique) si le besoin se confirme

---

## 3. Périmètre du projet

### Inclus dans le périmètre
- Création et gestion de plusieurs cahiers
- Saisie d'une ligne par session : date, heure de début, heure de fin, nombre de personnes
- Calcul automatique du temps mis et du cumul
- Calcul automatique du total "Complet" par cahier
- Consultation sous forme de tableau, par cahier
- Suppression d'une ligne
- Export Excel (par cahier, ou de l'ensemble des cahiers)

### Hors périmètre (pour cette version)
- Authentification / comptes utilisateurs individuels
- Saisie du détail des types de prière (Action de grâce, Proclamation, etc.) — jugée non nécessaire pour cette version
- Saisie nominative des participants (seul le nombre total est demandé)
- Application mobile native (l'outil reste une application web, utilisable depuis un navigateur)
- Historique des modifications / traçabilité de qui a saisi quoi

---

## 4. Acteurs et utilisateurs

| Acteur | Description | Droits |
|---|---|---|
| Utilisateur (agent de saisie) | Toute personne au bureau amenée à saisir une session | Accès libre, sans compte : création de cahiers, ajout/suppression de lignes, export |

Il n'y a pas de distinction de rôle ni de restriction d'accès dans cette version : l'accès est ouvert à toute personne disposant du lien de l'application.

---

## 5. Exigences fonctionnelles détaillées

### 5.1 Gestion des cahiers
- L'utilisateur peut créer un nouveau cahier en lui donnant un nom
- L'utilisateur peut basculer d'un cahier à un autre pour consulter ou saisir
- L'utilisateur peut supprimer un cahier (avec confirmation, car cela supprime aussi toutes ses lignes)
- Il doit toujours rester au moins un cahier existant
- Chaque cahier affiche en permanence son total "Complet" à côté de son nom, pour une lecture rapide sans avoir à l'ouvrir

### 5.2 Saisie d'une ligne (session)
Pour chaque ligne, l'utilisateur saisit :
- **Date** de la session
- **Heure de début**
- **Heure de fin**
- **Nombre de personnes** présentes

Avant validation, l'application affiche en aperçu le temps mis et le cumul calculés, pour permettre une vérification visuelle avant l'ajout définitif.

### 5.3 Calculs automatiques
- **Temps mis** = Heure de fin − Heure de début (aucune saisie manuelle possible sur ce champ)
- **Cumul** = Temps mis × Nombre de personnes
- **Complet du cahier** = somme des cumuls de toutes les lignes du cahier
- Les durées sont affichées au format `Xh YYmn` (ex : `7h42`, `1h30`), cohérent avec le format utilisé sur les cahiers papier
- Cas particulier : si l'heure de fin est antérieure à l'heure de début (session passant minuit), l'application ajoute 24h au calcul plutôt que de produire un résultat négatif

### 5.4 Consultation
- Tableau listant toutes les lignes d'un cahier, triées par date puis par heure
- Colonnes : Date, Début, Fin, Nombre de personnes, Temps mis, Cumul
- Ligne de total "Complet" affichée en bas de tableau, mise en évidence visuellement
- Suppression d'une ligne possible directement depuis le tableau

### 5.5 Export
- Export du cahier actuellement affiché vers un fichier Excel (.xlsx), incluant la ligne de total
- Export global : un classeur Excel avec une feuille récapitulative (liste des cahiers et de leurs totaux) + une feuille par cahier

---

## 6. Règles de gestion (résumé)

| Règle | Formule / condition |
|---|---|
| RG1 | Temps mis (minutes) = (Fin − Début), + 1440 min si le résultat est négatif |
| RG2 | Cumul (minutes) = Temps mis × Nombre de personnes |
| RG3 | Complet du cahier = Σ Cumul de toutes les lignes du cahier |
| RG4 | Une ligne ne peut être ajoutée sans Date, Début, Fin et Nombre de personnes ≥ 1 |
| RG5 | Un cahier ne peut être supprimé s'il est le dernier restant |

---

## 7. Exigences non fonctionnelles

| Catégorie | Exigence |
|---|---|
| Ergonomie | Saisie rapide, adaptée à un usage répété par plusieurs agents ; formulaire visible sans défilement excessif |
| Compatibilité | Fonctionne sur navigateur de bureau standard (Chrome, Edge, Firefox) ; consultable aussi depuis mobile |
| Performance | Affichage et calculs instantanés, même avec plusieurs centaines de lignes par cahier |
| Fiabilité | Aucune perte de données lors d'une saisie simultanée par plusieurs postes |
| Simplicité | Aucune formation nécessaire : les champs et libellés reprennent le vocabulaire des cahiers papier |
| Sécurité | Accès sans authentification dans cette version — à réévaluer si les données doivent être protégées (cf. section 10) |

---

## 8. Architecture technique

### 8.1 Version actuelle (prototype)
- Application web front-end (React), avec stockage clé-valeur intégré
- Données partagées entre tous les utilisateurs ouvrant le lien de l'application
- Export Excel généré côté navigateur

Cette version permet de valider les règles de calcul et l'ergonomie avant d'investir dans une infrastructure plus lourde.

### 8.2 Version cible envisageable (si le prototype est validé)
- **Front-end :** Next.js
- **Back-end :** API intégrée à Next.js (ou NestJS si séparation souhaitée)
- **Base de données :** PostgreSQL, via Prisma
- **Hébergement :** à définir selon le besoin de disponibilité (interne au bureau ou hébergement cloud)
- Avantages : sauvegardes automatiques, historique des données, possibilité d'ajouter une authentification plus tard sans tout reconstruire

---

## 9. Modèle de données

```
Cahier
├── id
└── nom

Ligne (rattachée à un Cahier)
├── id
├── cahier_id
├── date
├── heure_debut
├── heure_fin
├── nombre_personnes
├── temps_mis      (calculé)
└── cumul           (calculé)
```

Le total "Complet" d'un cahier n'est pas stocké : il est recalculé à l'affichage à partir de la somme des cumuls, pour garantir qu'il reste toujours exact même après suppression d'une ligne.

---

## 10. Contraintes et points de vigilance

- **Absence d'authentification** : toute personne ayant le lien peut modifier ou supprimer des données. À surveiller si le nombre de cahiers ou leur sensibilité augmente.
- **Stockage du prototype** : adapté à la validation, mais moins robuste qu'une vraie base de données pour un usage à long terme ou un très grand volume de lignes.
- **Saisie manuelle des horaires** : une erreur de saisie (ex : inverser début/fin) reste possible ; l'aperçu en direct avant validation vise à limiter ce risque.

---

## 11. Livrables

1. Prototype fonctionnel (réalisé) — pour validation des calculs et de l'ergonomie
2. Ce cahier des charges
3. Si validation : application déployée (V2), avec base de données et documentation technique associée

---

## 12. Critères de recette

- [ ] Le temps mis correspond exactement au calcul manuel fait sur cahier papier, pour un échantillon de sessions déjà saisies
- [ ] Le cumul correspond au calcul manuel (temps mis × nombre de personnes)
- [ ] Le total "Complet" d'un cahier correspond à la somme manuelle de ses lignes
- [ ] La création, la consultation et la suppression de cahiers fonctionnent sans perte de données
- [ ] L'export Excel reproduit fidèlement les données affichées à l'écran
- [ ] Plusieurs personnes peuvent saisir en même temps depuis des postes différents sans conflit

---

## 13. Évolutions possibles (hors périmètre actuel)

- Authentification simple par agent (pour tracer les saisies)
- Détail par type de prière (comme sur les cahiers papier les plus complets)
- Historique et statistiques (évolution du cumul dans le temps, par cahier)
- Sauvegarde automatique / export périodique programmé
