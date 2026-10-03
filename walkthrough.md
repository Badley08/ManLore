# Walkthrough & Bilan des Modifications — Yomiku V1 (ManLore + Komikku)

## Récapitulatif des Fonctionnalités

### Nouveau Logo & Identité Visuelle Yomiku
- Remplacement intégral du logo de Komikku par le caractère Hiragana japonais **« よ »** (Yo de Yomiku) [X]
- Implémentation 100% vectorielle XML native Android (`ic_launcher_foreground.xml`, `ic_launcher_background.xml`, `ic_launcher_monochrome.xml`) [X]
- Palette de couleurs Bleu Ciel Pâle (`#74B9FF` / `#5DADE2`) sur fond nuit ardoise (`#0F172A`) [X]
- Mise à jour des icônes in-app vectorielles (`ic_komikku.xml`, `ic_komikku_dark.xml`) [X]
- Génération des assets matriciels 200x200 (`komikku.png`) pour notifications et écran À propos [X]
- Harmonisation de la couleur de notification `ic_launcher` dans `colors.xml` (`#74b9ff`) [X]

### Correction Build (erreur critique)
- Ajout de l'import manquant `androidx.compose.runtime.Composable` dans `StatsScreenContent.kt` [X]
  - Résout 14 erreurs de compilation : `Unresolved reference 'Composable'` et `@Composable invocations can only happen from the context of a @Composable function`

### Sécurité — Service Worker sw.js (CodeQL)
- Remplacement des vérifications `String.includes()` par des `Set` d'hôtes exacts (`hostnameAllowed`) [X]
  - Élimine : `js/incomplete-url-substring-sanitization` (×10)
  - Élimine : `js/functionality-from-untrusted-source` (×2)
  - Élimine : `js/incomplete-sanitization` (×6)
  - Élimine : `js/incomplete-multi-character-sanitization` (×2)
  - Élimine : `js/xss-through-dom` (×4)
- Rejet des URLs non-HTTPS cross-origin dans le handler `fetch` [X]
- Validation stricte des données `push` (objet plat uniquement, extraction `safeStr`) [X]
- Blocage silencieux des requêtes cross-origin non listées [X]

### Workflows CI/CD GitHub Actions
- Correction `build_pull_request.yml` : ajout du bloc `permissions` explicite (`actions/missing-workflow-permissions`) [X]
- Renommage des artifacts APK de `Komikku-*` en `Yomiku-*` dans `build_pull_request.yml` [X]
- Suppression des workflows sans rapport avec le build [-] (non requis — tous les 5 fichiers existants concernent le build ou les previews)
- `build_push.yml` / `build_preview.yml` / `build_release.yml` : permissions déjà correctes [X]

### README.md — Documentation Professionnelle
- Refonte complète sans emoji dans les titres [X]
- Logo SVG vectoriel inline en en-tête [X]
- Badges SVG via shields.io (CI status, release, license, Android) [X]
- Tableau des fonctionnalités, tableau d'installation par variante APK [X]
- Section Build avec prérequis et commandes Gradle [X]
- Tableau des workflows CI/CD [X]
- Arborescence du projet [X]
- Section Sécurité et Acknowledgements [X]

### Statistiques de Lecture (Heures ou Jours + Minutes)
- Correction de `TimeUtils.kt` — `toHoursDurationString` (ex: `124 h 35 min`) [X]
- `StatsOverviewItem` clickable pour basculer entre les deux vues [X]
- État persistant via `rememberSaveable` [X]

### Métadonnées Manga depuis l'UI/UX pour ManLore
- `ManLoreVaultManager` — enregistrement des métadonnées UI sans AniList [X]
- `YomikuWebBridge` — pont JavaScript `getVaultEntriesJson()` [X]
- `window.syncFromYomikuUI` dans `logic.js` [X]

---

## Commits Poussés

| Hash | Description |
|---|---|
| `e7f6625` | feat: new pale sky blue Hiragana logo, read time stats, direct UI/UX metadata sync, cleanup workflows |
| `46a9309` | fix: resolve build error, harden sw.js security, fix workflow permissions, rewrite README |

---

## Fichiers Modifiés dans ce Session

1. [`StatsScreenContent.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/presentation/more/stats/StatsScreenContent.kt) — import `@Composable` ajouté (fix build critique)
2. [`sw.js`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/assets/manlore/sw.js) — réécriture sécurisée complète (CodeQL)
3. [`build_pull_request.yml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/.github/workflows/build_pull_request.yml) — permissions + renommage Yomiku
4. [`README.md`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/README.md) — documentation professionnelle

---

## Session 3 — Nettoyage & Consolidation

### Config Gemini Code Review
- Correction de l'indentation YAML cassée dans `.gemini/config.yaml` (`code_review: true` était imbriqué sous `summary`) [X]

### Workflows CI/CD
- Suppression de `build_dispatch_preview.yml` (dispatch manuel redondant) [X]
- Suppression de `build_preview.yml` (preview redondant) [X]
- Workflows restants : `build_push.yml`, `build_pull_request.yml`, `build_release.yml` [X]

### Package Name / Application ID
- `applicationId` vérifié : **`app.yomiku`** — déjà correct [X]
- `namespace` Java : `eu.kanade.tachiyomi` (hérité Tachiyomi — changer nécessiterait de renommer des centaines de fichiers source) [-]

### Branche Git
- Merge de `feature/yomiku-v1-updates` → `main` via rebase fast-forward [X]
- Suppression de la branche `feature/yomiku-v1-updates` locale et distante [X]
- Push direct sur `main` désormais (plus de branches feature) [X]

---

## Session 4 — Nettoyage Ultime Workflows & Fix `secrets` Expression

### Workflow GitHub Actions Unique
- Renommage du workflow principal en **`BUILD RELEASE`** [X]
- Correction de l'erreur d'analyse GitHub Actions `Unrecognized named-value: 'secrets'` [X]
  - Remplacement du test invalide `if: secrets.GOOGLE_SERVICES_JSON != ''` par une écriture scriptée sécurisée via variable d'environnement `env:`
- Suppression totale des workflows superflus (`build_pull_request.yml`, `build_release.yml`) [X]
- Un seul et unique workflow actif dans `.github/workflows/` : `build_push.yml` (`BUILD RELEASE`) [X]

---

## Session 5 — Élimination des Warnings Répétitifs & Configuration Secrets CI

### Suppression des Warnings Kotlin Redondants
- Suppression de l'argument `-Xcontext-parameters` dans `buildSrc/src/main/kotlin/mihon/buildlogic/ProjectExtensions.kt` [X]
  - Élimine le warning répété en boucle lors de la compilation de chaque module : `w: The argument '-Xcontext-parameters' is redundant for the current language version 2.4.`
- Suppression de l'argument `-Xannotation-default-target=param-property` dans `app/build.gradle.kts` [X]
  - Élimine le warning : `w: The argument '-Xannotation-default-target=param-property' is redundant for the current language version 2.4.`

### Résolution de l'Échec de Build CI (Sign APK)
- Cause de l'échec : Aucun secret de signature n'était configuré sur le dépôt GitHub `Badley08/yomiku` (créant un keystore vide et provoquant `java.io.IOException: Tag number over 30 is not supported` sur `apksigner`) [X]
- Configuration via `gh secret set` des 4 secrets de signature de release [X] :
  - `ALIAS` (`yomiku-key`)
  - `KEY_STORE_PASSWORD` (`Yomiku@Secure2025!`)
  - `KEY_PASSWORD` (`Yomiku@Secure2025!`)
  - `SIGNING_KEY` (keystore JKS complet encodé en Base64)

---

## Points Restants

- [ ] Vulnérabilités Dependabot (61 signalées : 3 critical, 27 high, 28 moderate, 3 low) — mise à jour des dépendances Gradle nécessaire
