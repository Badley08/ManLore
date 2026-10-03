# Walkthrough & Bilan des Modifications — Yomiku V1 (ManLore + Komikku)

## 📊 Récapitulatif des Fonctionnalités

### 🎨 Nouveau Logo & Identité Visuelle Yomiku
- Remplacement intégral du logo de Komikku par le caractère Hiragana japonais **« よ »** (Yo de Yomiku) [X]
- Implémentation 100% vectorielle XML native Android (`ic_launcher_foreground.xml`, `ic_launcher_background.xml`, `ic_launcher_monochrome.xml`) [X]
- Palette de couleurs moderne **Bleu Ciel Pâle** (`#74B9FF` / `#5DADE2`) sur fond nuit ardoise (`#0F172A`) [X]
- Mise à jour des icônes in-app vectorielles (`ic_komikku.xml`, `ic_komikku_dark.xml`) [X]
- Génération des assets matriciels 200x200 (`komikku.png`) pour les notifications étendues et l'écran À propos [X]
- Harmonisation de la couleur de notification `ic_launcher` dans `colors.xml` (`#74b9ff`) [X]

### 📈 Statistiques de Lecture (Heures ou Jours + Minutes)
- Correction de l'affichage des durées dans `TimeUtils.kt` pour préserver systématiquement les minutes même lorsque le temps dépasse un ou plusieurs jours [X]
- Création de la fonction `toHoursDurationString` pour convertir la durée totale de lecture directement en heures cumulées et minutes (ex: `124 h 35 min`) [X]
- Ajout de l'interactivité par clic (`Modifier.clickable`) sur `StatsOverviewItem` dans `StatsItem.kt` [X]
- Intégration dans `StatsScreenContent.kt` du basculement d'affichage (clic sur la carte de temps de lecture pour alterner instantanément entre jours + heures + minutes et total en heures) [X]
- Conservation de l'état de vue choisi via `rememberSaveable` [X]

### 📖 Métadonnées Manga Directement depuis l'UI/UX pour ManLore
- Suppression des dépendances de requêtes externes (pas de fetch AniList, Jikan ou MyAnimeList) [X]
- Capture directe des métadonnées du modèle `Manga` présent dans l'UI/UX (`title`, `description`, `thumbnailUrl`, `genre`, `author`, `artist`) traduit selon la langue de l'appareil et la source [X]
- Évolution de `ManLoreVaultManager` pour enregistrer l'intégralité des métadonnées du manga lors de la progression de lecture [X]
- Implémentation du pont WebView `YomikuWebBridge` avec exposition de `getVaultEntriesJson()` et `getDeviceLanguage()` [X]
- Implémentation de `window.syncFromYomikuUI` dans les scripts de ManLore (`logic.js`) pour insérer ou mettre à jour automatiquement les mangas sans requête réseau tierce [X]

### 🛠️ Workflows CI/CD GitHub Actions & PRs
- Correction des chemins de sortie dans `.github/workflows/build_push.yml` (`releaseDirectory: app/build/outputs/apk/release` et mapping `outputs/mapping/release`) [X]
- Gestion du fallback automatique entre APK signé et non signé dans le workflow [X]
- Merge des Pull Requests GitHub dépendantes (PR #1 dependabot) : laissé de côté selon consigne utilisateur en raison des règles de protection de branche nécessitant une approbation par un tiers [-]

---

## 🛠️ Détails des Fichiers Modifiés et Ajoutés

1. [`yomiku/app/src/main/res/drawable/ic_launcher_foreground.xml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/res/drawable/ic_launcher_foreground.xml)
   - Tracé vectoriel précis de l'Hiragana japonais « よ » en blanc pur `#FFFFFFFF`.
2. [`yomiku/app/src/main/res/drawable/ic_launcher_background.xml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/res/drawable/ic_launcher_background.xml)
   - Disque Bleu Ciel Pâle (`#74B9FF` / `#5DADE2`) centré sur fond nuit `#0F172A`.
3. [`yomiku/app/src/main/res/drawable/ic_launcher_monochrome.xml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/res/drawable/ic_launcher_monochrome.xml)
   - Icône monochrome thématique pour Android 13+.
4. [`yomiku/app/src/main/res/drawable/ic_komikku.xml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/res/drawable/ic_komikku.xml) & [`ic_komikku_dark.xml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/res/drawable/ic_komikku_dark.xml)
   - Logos in-app vectoriels avec l'Hiragana « よ ».
5. [`yomiku/app/src/main/res/values/colors.xml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/res/values/colors.xml)
   - Définition de `ic_launcher` en bleu ciel pâle `#74b9ff`.
6. [`yomiku/app/src/main/java/eu/kanade/presentation/util/TimeUtils.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/presentation/util/TimeUtils.kt)
   - Ajout de `toHoursDurationString` et correction de la visibilité des minutes avec les jours.
7. [`yomiku/app/src/main/java/eu/kanade/presentation/more/stats/components/StatsItem.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/presentation/more/stats/components/StatsItem.kt)
   - Support du clic utilisateur (`onClick`) sur les items de statistiques.
8. [`yomiku/app/src/main/java/eu/kanade/presentation/more/stats/StatsScreenContent.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/presentation/more/stats/StatsScreenContent.kt)
   - Gestion dynamique du basculement d'affichage (heures totales vs jours + heures + minutes).
9. [`yomiku/app/src/main/java/eu/kanade/domain/manlore/ManLoreVaultManager.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/domain/manlore/ManLoreVaultManager.kt)
   - Gestionnaire persistant de données manga UI/UX (titre, description, jaquette, genres, progression) sans dépendance AniList.
10. [`yomiku/app/src/main/java/eu/kanade/tachiyomi/ui/reader/ReaderViewModel.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/tachiyomi/ui/reader/ReaderViewModel.kt)
    - Transmission automatique de toutes les métadonnées de l'UI locale vers `ManLoreVaultManager`.
11. [`yomiku/app/src/main/java/eu/kanade/tachiyomi/ui/manlore/ManLoreTab.kt`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/java/eu/kanade/tachiyomi/ui/manlore/ManLoreTab.kt)
    - Pont JavaScript `YomikuBridge` et injection automatique des métadonnées lors du chargement de la WebView.
12. [`yomiku/app/src/main/assets/manlore/logic.js`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/app/src/main/assets/manlore/logic.js)
    - Fonction `window.syncFromYomikuUI` pour intégrer directement les mangas lus dans le Vault ManLore.
13. [`yomiku/.github/workflows/build_push.yml`](file:///home/luberisse/Bureau/WORKSPACE/ManLore/yomiku/.github/workflows/build_push.yml)
    - Correction des chemins `app/build/outputs/apk/release` et mapping associé.
