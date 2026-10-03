# Analyse complète du GitHub Actions — Yomiku

## Run analysé

- Repository : `Badley08/yomiku`
- Workflow : `CI`
- Run : `36518687007`
- Job : `Build app`
- Job ID : `109246602033`
- Commit compilé : `e6b7b8d77759cbb2cdf10e08a2434ff60374d142`
- Branche : `main`
- Runner : Ubuntu 24.04.5 LTS
- Java : Temurin 17.0.20
- Node.js : 24.21.0
- Gradle : 9.3.1
- Résultat GitHub Actions : **SUCCESS**

## 1. Résumé

Cette fois, contrairement aux runs précédents, **le code Kotlin compile correctement**.

Le log confirme :

```text
> Task :app:assembleRelease
BUILD SUCCESSFUL in 9m 24s
549 actionable tasks: 471 executed, 78 from cache
```

Le nouveau problème n'est donc plus une erreur Kotlin. Il concerne le pipeline après la compilation, surtout l'étape de signature.

Le workflow construit :

```text
assembleRelease
```

mais l'étape de signature cherche :

```text
app/build/outputs/apk/preview
```

Le log donne :

```text
ENOENT: no such file or directory, scandir 'app/build/outputs/apk/preview'
```

`ENOENT` signifie que le chemin demandé n'existe pas.

## 2. Pourquoi cela arrive

Le workflow contient :

```yaml
- name: Build app
  run: ./gradlew assembleRelease -Penable-updater || ./gradlew assemblePreview
```

Cette commande signifie :

1. essayer `assembleRelease`;
2. si `assembleRelease` échoue, essayer `assemblePreview`.

Dans ce run, `assembleRelease` réussit. Le fallback `assemblePreview` n'est donc pas exécuté.

Le workflow produit donc un APK Release.

Mais juste après, il demande à l'action de signature de parcourir :

```yaml
releaseDirectory: app/build/outputs/apk/preview
```

C'est incohérent.

La séquence réelle est :

```text
assembleRelease
    |
    v
app/build/outputs/apk/release
    |
    v
Sign APK
    |
    X
cherche app/build/outputs/apk/preview
```

## 3. La vraie erreur

Erreur exacte :

```text
##[error]ENOENT: no such file or directory, scandir 'app/build/outputs/apk/preview'
```

Ce n'est pas une erreur de compilation.

Ce n'est pas une erreur ManLore.

Ce n'est pas une erreur ReaderViewModel.

Ce n'est pas une erreur WebDAV.

C'est une erreur de chemin dans le workflow GitHub Actions.

## 4. Pourquoi GitHub affiche quand même SUCCESS

L'étape de signature contient :

```yaml
continue-on-error: true
```

Cela signifie que même si la signature échoue, GitHub continue le job.

Donc le résultat peut être :

```text
Build app       SUCCESS
Sign APK        erreur, mais tolérée
Prepare Output  SUCCESS
Upload APK      SUCCESS
Job             SUCCESS
```

Ce comportement est cohérent avec la configuration du workflow. GitHub documente que les logs permettent d'identifier l'étape qui a rencontré une erreur et de diagnostiquer le job. citeturn0search4

## 5. L'APK a quand même été généré

Oui.

Le workflow utilise ensuite :

```bash
find app/build/outputs/apk/ -name "*.apk" | head -n 1
```

Il peut donc trouver l'APK Release même si l'étape de signature cherchait le mauvais dossier.

L'artefact a été uploadé avec succès.

Le log indique une taille finale de :

```text
27587935 bytes
```

soit environ 26,3 MiB.

Mais attention : **la présence de l'APK dans l'artefact ne prouve pas que l'étape CI l'a correctement signé**.

## 6. Deuxième chemin incorrect : le mapping

L'étape suivante utilise :

```yaml
- name: Upload mapping
  uses: actions/upload-artifact@...
  with:
    name: mapping-${{ github.sha }}
    path: app/build/outputs/mapping/preview
```

Le log indique :

```text
No files were found with the provided path: app/build/outputs/mapping/preview.
No artifacts will be uploaded.
```

Là encore, le build principal est Release.

Le chemin cohérent serait :

```yaml
path: app/build/outputs/mapping/release
```

Ce warning ne fait pas échouer le job parce que l'upload utilise un comportement permissif (`if-no-files-found: warn`).

## 7. Les deux corrections principales

Dans `.github/workflows/build_push.yml` :

### Signature

Actuellement :

```yaml
releaseDirectory: app/build/outputs/apk/preview
```

Pour un build Release :

```yaml
releaseDirectory: app/build/outputs/apk/release
```

### Mapping

Actuellement :

```yaml
path: app/build/outputs/mapping/preview
```

Pour un build Release :

```yaml
path: app/build/outputs/mapping/release
```

## 8. Pourquoi `Prepare Output APK` fonctionne

Le script actuel :

```bash
find app/build/outputs/apk/ -name "*.apk" | head -n 1 | xargs -I {} cp {} ./Yomiku-$version_tag-r$commit_count.apk
```

cherche dans tout :

```text
app/build/outputs/apk/
```

Il ne limite pas la recherche à `preview`.

Il peut donc trouver l'APK situé sous :

```text
app/build/outputs/apk/release/
```

C'est exactement pourquoi l'étape de préparation réussit après l'échec de la signature.

## 9. Problème potentiel du `head -n 1`

Cette commande :

```bash
find app/build/outputs/apk/ -name "*.apk" | head -n 1
```

prend le premier APK retourné.

Si plusieurs APK existent, ce choix n'est pas très robuste.

Pour un pipeline Release, il est préférable de cibler explicitement le dossier Release, par exemple :

```bash
find app/build/outputs/apk/release -type f -name "*.apk" | head -n 1
```

Cela évite qu'un futur APK Preview, Debug ou autre soit sélectionné par accident.

## 10. Faut-il supprimer `continue-on-error` ?

Cela dépend de l'objectif.

Si la signature est réellement optionnelle parce que les secrets ne sont pas toujours disponibles, conserver :

```yaml
continue-on-error: true
```

peut être volontaire.

Mais si l'APK doit obligatoirement être signé pour être distribué, cette option masque un problème important.

Dans ce cas, une erreur de signature devrait faire échouer le pipeline.

Le plus important est de ne pas interpréter :

```text
GitHub Actions = SUCCESS
```

comme :

```text
APK correctement signé = garanti
```

Ce sont deux choses différentes dans la configuration actuelle.

## 11. Les anciens problèmes sont maintenant dépassés

Les erreurs précédentes de :

- `ManLoreVaultManager`
- `ReaderViewModel`
- WebDAV

ne sont plus les bloqueurs de ce run.

Le build arrive maintenant jusqu'à :

```text
> Task :app:assembleRelease
BUILD SUCCESSFUL
```

C'est un progrès important.

La prochaine correction doit donc viser le workflow CI, pas réintroduire les anciennes corrections Kotlin.

## 12. Warnings qui ne sont pas responsables

Le log contient plusieurs avertissements.

### Cache Gradle

On voit notamment :

```text
Cache service responded with 400
```

et plus tard :

```text
Our services aren't available right now
```

Le cache a donc rencontré un problème côté service GitHub.

Mais Gradle continue et compile le projet.

Ce n'est pas la cause de l'erreur de signature.

### Dépréciation Kotlin

Le projet signale notamment :

```text
Deprecated Gradle Property 'kotlin.mpp.androidSourceSetLayoutVersion' Used
```

et :

```text
sourceSets collection in Kotlin Android is deprecated
```

Ce sont des problèmes de maintenance à corriger plus tard.

Ils n'empêchent pas `assembleRelease` de réussir dans ce run.

### Gradle 10

Le log indique que des fonctionnalités Gradle dépréciées rendent le projet incompatible avec une future version majeure.

Cela ne signifie pas que Gradle 9.3.1 ne fonctionne pas.

Le build actuel termine bien par :

```text
BUILD SUCCESSFUL
```

### Kotlin Metadata

Le log contient aussi des messages indiquant qu'une version de metadata Kotlin 2.4.0 est plus récente que la version maximale comprise par une bibliothèque utilisée.

Ces messages sont à traiter comme un problème de compatibilité/maintenance séparé.

Ils n'ont pas empêché `assembleRelease` de réussir.

### Node.js / actions

GitHub signale aussi des actions utilisant encore Node 20 et recommande des mises à jour futures.

Cela ne bloque pas ce run.

## 13. Pourquoi le build a été relativement long

Le cache Gradle n'a pas été restauré correctement :

```text
Gradle User Home cache not found. Will initialize empty.
```

Gradle a donc dû télécharger sa distribution et reconstruire beaucoup de choses.

Le log indique :

```text
549 actionable tasks
471 executed
78 from cache
```

Puis :

```text
BUILD SUCCESSFUL in 9m 24s
```

Le temps élevé est donc en partie expliqué par le cache absent/indisponible.

## 14. Architecture correcte du pipeline

Si le but est de produire le Release Yomiku, le pipeline devrait ressembler à :

```text
Checkout
   |
   v
JDK 17
   |
   v
Node 24
   |
   v
Gradle
   |
   v
assembleRelease
   |
   v
app/build/outputs/apk/release/
   |
   +----> Sign APK
   |
   +----> Prepare Output APK
   |
   +----> Upload APK
   |
   +----> app/build/outputs/mapping/release/
              |
              v
         Upload mapping
```

Il ne faut plus mélanger :

```text
Release
```

et :

```text
Preview
```

dans les étapes post-build.

## 15. Vérification locale recommandée

Après modification :

```bash
./gradlew clean assembleRelease -Penable-updater
```

Puis :

```bash
find app/build/outputs/apk/ -type f -name "*.apk"
```

Le résultat devrait être sous un chemin Release.

Pour le mapping :

```bash
find app/build/outputs/mapping/ -type f
```

Pour vérifier une signature Android :

```bash
apksigner verify --verbose app/build/outputs/apk/release/*.apk
```

## 16. Ce qu'il ne faut pas faire

Ne pas réintroduire WebDAV.

Ne pas recréer :

```text
webDavUrl
webDavFolder
webDavUsername
webDavPassword
```

Ne pas modifier à nouveau `chapterNumber` / `chapter_number` au hasard.

Ne pas revenir aux anciennes corrections Kotlin simplement parce que le run précédent avait des erreurs Kotlin.

Le run actuel montre que la compilation fonctionne.

## 17. Diagnostic final

Le run `36518687007` est un changement majeur :

### Ancien problème

```text
Code Kotlin
   |
   X
Compilation
```

### Nouveau résultat

```text
Code Kotlin
   |
   v
Compilation
   |
   v
assembleRelease
   |
   v
SUCCESS
   |
   v
Signature
   |
   X
mauvais dossier : preview
   |
   v
continue-on-error
   |
   v
workflow continue
   |
   v
APK trouvé et uploadé
```

### Conclusion

**Yomiku compile maintenant correctement. Le problème actuel est dans `.github/workflows/build_push.yml` : le workflow construit un Release mais tente ensuite de signer et de récupérer le mapping dans les dossiers Preview.**

Les deux chemins principaux à corriger sont :

```yaml
releaseDirectory: app/build/outputs/apk/release
```

et :

```yaml
path: app/build/outputs/mapping/release
```

Ensuite, il faudra décider si la signature doit être réellement obligatoire ou rester tolérée avec `continue-on-error: true`.

## 18. Références

- Run : `36518687007`
- Job : `109246602033`
- Commit : `e6b7b8d77759cbb2cdf10e08a2434ff60374d142`
- Workflow : `.github/workflows/build_push.yml`
- Commande : `./gradlew assembleRelease -Penable-updater || ./gradlew assemblePreview`
