# Yomiku (ManLore + Komikku) - Task List & Roadmap

## 📌 Status Legend
- `[X]` : Terminé / Ajouté
- `[-]` : Écarté / Non retenu
- `[ ]` : En attente / À réaliser

---

## 🚀 Étape 1 : Clone & Configuration du Projet Yomiku
- [X] Cloner le dépôt `Badley08/komikku` [X]
- [X] Créer la structure du dépôt distinct **Yomiku** (fusion ManLore + Komikku) [X]
- [X] Renommer toutes les références `Komikku` en `Yomiku` (applicationId = `app.yomiku`, rootProject.name = `Yomiku`, app_name = `Yomiku`, scheme = `yomiku`, en conservant le package `eu.kanade.tachiyomi`) [X]
- [X] Mettre à jour la section Crédits pour remercier les contributeurs de Komikku [X]
- [X] Suppression des liens/icônes Discord et branding Komikku [X]
- [X] Créer/mettre à jour la documentation README.md en anglais [X]

---

## 🔗 Étape 2 : Intégration ManLore & Yomiku
- [X] Intégration fluide de la navigation entre ManLore et Yomiku (onglet `ManLoreTab` WebView dans l'application) [X]
- [X] Sauvegarde automatique des lectures de mangas directement dans le Vault de ManLore via `ManLoreVaultManager` [X]
- [X] Gestion de la connexion utilisateur (choix entre stockage local ou synchro Cloud) [X]
- [X] Accessibilité des paramètres et navigation unifiée au sein d'une seule application [X]

---

## 🗄️ Étape 3 : Migration Base de Données (Turso) & Synchronisation
- [X] Remplacer Back4app par Turso (`libsql://manlore-badley08.aws-ap-northeast-1.turso.io`) [X]
- [X] Configurer le jeton d'authentification Turso dans `SyncPreferences` [X]
- [X] Dans les paramètres de synchronisation, **supprimer WebDAV** pour ne conserver strictement que **Google Drive** et **ManLore Sync** [X]
- [X] Rédiger et intégrer un message d'information aux utilisateurs concernant la nouvelle base de données [X]
- [X] Intégrer les schémas et la gestion de `manlore.db` directement dans le main de Yomiku [X]

---

## 🛠️ Étape 4 : CI/CD GitHub Actions & Release V1
- [X] Créer/configurer les workflows GitHub Actions pour builder Yomiku V1 (`build_release.yml` et `build_push.yml`) [X]
- [X] Configurer les prérequis du workflow : Node.js LTS (24.x), Java 17 LTS (via `.java-version`), Gradle 9.x [X]
- [X] Optimisation du build et génération des APKs signés sous le nom `Yomiku-v1.apk` [X]
- [X] Correction du chemin de signature `app/build/outputs/apk/release` et mapping d'artefacts [X]
- [-] Merge des PRs GitHub externes (bloqué par les règles de protection exigeant review tierce) [-]

---

## 🎨 Étape 5 : Identité Visuelle, Statistiques & Données UI/UX
- [X] Nouveau logo vectoriel XML basé sur l'Hiragana japonais **« よ »** (Yo de Yomiku) sans lettre latine 'Y' [X]
- [X] Thème de couleur **Bleu Ciel Pâle** (`#74B9FF` / `#5DADE2`) sur fond nuit `#0F172A` pour l'ensemble des icônes [X]
- [X] Mise à jour des icônes adaptives Android (`foreground`, `background`, `monochrome`), in-app (`ic_komikku.xml`) et matricielles (`komikku.png`) [X]
- [X] Statistiques de lecture : affichage commutable dynamique soit en heures totales (`XX h YY min`), soit en jours + heures + minutes (`Xj Yh Zm`) par clic [X]
- [X] Correction de l'affichage des minutes pour ne jamais les masquer quand la durée dépasse plusieurs jours [X]
- [X] Récupération et transmission automatique des métadonnées du manga directement depuis l'UI/UX locale (titre, description, jaquette, genres) vers le Vault ManLore sans requête externe AniList [X]
- [X] Pont WebView `YomikuWebBridge` et synchronisation automatique `syncFromYomikuUI` dans ManLore [X]

