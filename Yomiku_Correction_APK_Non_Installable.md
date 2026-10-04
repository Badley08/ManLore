# Yomiku — Correction de l’APK non installable

## 1. Diagnostic

Le build GitHub Actions du workflow `CI` compile correctement Yomiku, mais l’étape de signature peut échouer sans faire échouer le workflow.

Dans `.github/workflows/build_push.yml`, la signature utilise :

```yaml
- name: Sign APK (if key available)
  continue-on-error: true
  uses: r0adkll/sign-android-release@v1
```

Le problème principal est `continue-on-error: true`.

Lorsque `apksigner` ne parvient pas à lire le keystore, le workflow continue malgré l’échec de la signature. Ensuite, l’étape `Prepare Output APK` cherche d’abord un APK signé, puis utilise volontairement un APK non signé comme solution de secours :

```bash
APK_FILE=$(find app/build/outputs/apk/release/ -name "*signed*.apk" | head -n 1)

if [ -z "$APK_FILE" ]; then
  APK_FILE=$(find app/build/outputs/apk/release/ -name "*.apk" | head -n 1)
fi
```

Le workflow peut donc publier un fichier du type :

```text
app-arm64-v8a-release-unsigned.apk
```

Un APK release non signé ne doit pas être utilisé comme APK final à installer.

---

## 2. Objectif de la correction

Le workflow doit respecter cette chaîne :

```text
Compilation
    ↓
Signature
    ↓
Vérification de la signature
    ↓
APK signé
    ↓
Upload de l’APK
```

Si la signature échoue :

```text
Compilation
    ↓
Signature échouée
    ↓
Workflow FAILED
```

Il ne faut jamais continuer avec un APK `unsigned`.

---

# 3. Vérifier les secrets GitHub

Avant de modifier le workflow, vérifier que les secrets suivants existent dans le dépôt :

```text
SIGNING_KEY
ALIAS
KEY_STORE_PASSWORD
KEY_PASSWORD
```

Dans GitHub :

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Repository secrets
```

Les valeurs doivent correspondre au même keystore.

### Attention

Ne jamais placer directement le keystore, son mot de passe ou les mots de passe dans le fichier YAML.

Les secrets doivent rester dans GitHub Actions Secrets.

---

# 4. Vérifier le keystore localement

Le problème rencontré précédemment contenait l’erreur :

```text
Failed to load signer "signer #1"
java.io.IOException: Tag number over 30 is not supported
```

Cette erreur indique que le fichier fourni à `apksigner` n’est pas correctement interprété comme un keystore.

Avant de modifier GitHub Actions, il faut donc vérifier le keystore.

Sur Linux :

```bash
keytool -list -v -keystore yomiku-release.jks
```

Remplacer `yomiku-release.jks` par le véritable fichier.

Si le keystore est au format PKCS12 :

```bash
keytool -list -v \
  -storetype PKCS12 \
  -keystore yomiku-release.p12
```

Le mot de passe demandé doit permettre à `keytool` de lire le fichier.

Si `keytool` ne peut pas lire le fichier, il faut corriger ou recréer le keystore avant de modifier GitHub Actions.

---

# 5. Si nécessaire, créer un nouveau keystore

Si le keystore actuel est réellement corrompu, invalide ou dans un format inattendu, créer un nouveau keystore.

Exemple :

```bash
keytool -genkeypair \
  -v \
  -keystore yomiku-release.jks \
  -alias yomiku \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Pendant la création, conserver soigneusement :

```text
Nom du fichier :
yomiku-release.jks

Alias :
yomiku

Mot de passe du keystore :
[à conserver]

Mot de passe de la clé :
[à conserver]
```

Pour une application destinée à être distribuée durablement, conserver ce keystore en lieu sûr. Perdre la clé de signature peut empêcher les futures mises à jour d’une application déjà distribuée.

---

# 6. Tester le nouveau keystore

Avant de l'utiliser dans GitHub Actions :

```bash
keytool -list -v -keystore yomiku-release.jks
```

Vérifier notamment :

```text
Alias name: yomiku
Entry type: PrivateKeyEntry
```

Le keystore doit être lisible sans erreur.

---

# 7. Convertir le keystore en Base64

Le secret `SIGNING_KEY` utilisé par le workflow doit contenir le keystore encodé en Base64.

Sur Linux :

```bash
base64 -w 0 yomiku-release.jks > signing_key_base64.txt
```

Le fichier `signing_key_base64.txt` contient alors une seule longue ligne.

Copier son contenu dans :

```text
GitHub
→ Settings
→ Secrets and variables
→ Actions
→ SIGNING_KEY
```

Ne pas committer ce fichier dans le dépôt.

Après utilisation, le supprimer du dossier du projet si nécessaire :

```bash
rm signing_key_base64.txt
```

---

# 8. Configurer les quatre secrets

Les secrets doivent correspondre à la nouvelle clé.

### SIGNING_KEY

Contenu :

```text
Base64 du fichier yomiku-release.jks
```

### ALIAS

Exemple :

```text
yomiku
```

### KEY_STORE_PASSWORD

Le mot de passe défini lors de la création du keystore.

### KEY_PASSWORD

Le mot de passe de la clé privée.

Si le même mot de passe a été utilisé pour le keystore et la clé, les deux secrets peuvent avoir la même valeur.

---

# 9. Modifier `build_push.yml`

Fichier :

```text
.github/workflows/build_push.yml
```

## 9.1 Supprimer `continue-on-error`

Remplacer :

```yaml
- name: Sign APK (if key available)
  continue-on-error: true
  uses: r0adkll/sign-android-release@v1
```

par :

```yaml
- name: Sign APK
  uses: r0adkll/sign-android-release@v1
```

Le point essentiel est de supprimer :

```yaml
continue-on-error: true
```

Ainsi, si la signature échoue, le workflow s'arrête.

---

# 10. Supprimer le fallback vers l’APK unsigned

La partie actuelle :

```bash
# Prefer signed APK if present, otherwise fallback to unsigned APK
APK_FILE=$(find app/build/outputs/apk/release/ -name "*signed*.apk" | head -n 1)

if [ -z "$APK_FILE" ]; then
  APK_FILE=$(find app/build/outputs/apk/release/ -name "*.apk" | head -n 1)
fi
```

ne doit plus exister.

Elle est dangereuse parce qu'elle autorise précisément le problème rencontré.

---

# 11. Remplacer la sélection de l’APK

Utiliser une vérification stricte.

Exemple :

```bash
set -e

version_tag=$(echo ${GITHUB_REF/refs\/heads\//} | sed -r 's/^refs\/(heads|tags)\///' | sed -r 's/[-\/]+/_/g')
commit_count=$(git rev-list --count HEAD)

echo "VERSION_TAG=$version_tag" >> $GITHUB_OUTPUT
echo "COMMIT_COUNT=$commit_count" >> $GITHUB_OUTPUT

APK_FILE=$(find app/build/outputs/apk/release/ -name "*signed*.apk" | head -n 1)

if [ -z "$APK_FILE" ]; then
  echo "ERROR: No signed APK was produced."
  echo "The build must not publish an unsigned APK."
  exit 1
fi

echo "Using signed APK: $APK_FILE"

cp "$APK_FILE" "./Yomiku-$version_tag-r$commit_count.apk"
```

Avec cette logique :

```text
APK signé trouvé
    → continuer

Aucun APK signé
    → arrêter le workflow
```

---

# 12. Ajouter une vérification avec `apksigner`

Il est recommandé de vérifier réellement la signature avant l'upload.

Ajouter une étape après la signature :

```yaml
- name: Verify APK signature
  run: |
    set -e

    APK_FILE=$(find app/build/outputs/apk/release/ -name "*signed*.apk" | head -n 1)

    if [ -z "$APK_FILE" ]; then
      echo "ERROR: No signed APK found."
      exit 1
    fi

    echo "Verifying: $APK_FILE"

    "$ANDROID_HOME/build-tools/35.0.1/apksigner" verify --verbose "$APK_FILE"
```

Une vérification réussie doit se terminer sans erreur.

Le but est de vérifier que l'APK est réellement signé et que sa signature peut être validée.

---

# 13. Vérifier l’APK téléchargé

Après avoir lancé GitHub Actions, télécharger uniquement l'APK produit après la signature.

Le nom devrait ressembler à :

```text
Yomiku-main-rXXXX.apk
```

ou au nom défini par le workflow.

Ne pas télécharger :

```text
*-unsigned.apk
```

Ne pas utiliser un APK dont le nom contient explicitement :

```text
unsigned
```

---

# 14. Vérification locale optionnelle

Sur Linux, après téléchargement :

```bash
$ANDROID_HOME/build-tools/35.0.1/apksigner verify --verbose Yomiku.apk
```

Si `ANDROID_HOME` n'est pas défini, utiliser directement le chemin vers `apksigner`.

Une autre vérification utile :

```bash
unzip -l Yomiku.apk | head
```

Le fichier doit être une archive ZIP Android valide contenant notamment :

```text
AndroidManifest.xml
classes.dex
META-INF/
```

---

# 15. Installer sur le OnePlus Nord N100

Une fois l'APK signé téléchargé, l'installation peut être testée normalement.

Avec ADB :

```bash
adb install Yomiku.apk
```

Pour remplacer une version déjà installée :

```bash
adb install -r Yomiku.apk
```

Si Android refuse encore l'installation, noter le message exact affiché par Android.

Il faudra alors distinguer :

```text
APK invalide
```

de :

```text
signature différente
```

de :

```text
version incompatible
```

de :

```text
architecture incompatible
```

Ces erreurs n'ont pas la même cause.

---

# 16. Vérifier l’architecture

Yomiku produit plusieurs variantes dans le workflow de release :

```text
Yomiku-<version>.apk
Yomiku-arm64-v8a-<version>.apk
Yomiku-armeabi-v7a-<version>.apk
Yomiku-x86-<version>.apk
Yomiku-x86_64-<version>.apk
```

Pour un téléphone Android ARM64 moderne, l'APK :

```text
arm64-v8a
```

est généralement la variante appropriée.

Le OnePlus Nord N100 utilise une plateforme ARM64, donc l'architecture `arm64-v8a` est adaptée à cet appareil.

La variante universelle est également pratique pour les tests lorsqu'elle est correctement construite et signée.

---

# 17. Attention au workflow de release

Le dépôt possède également :

```text
.github/workflows/build_release.yml
```

Ce workflow utilise une architecture différente :

```text
Build app
    ↓
Upload artifacts
    ↓
Download artifacts
    ↓
Sign APK
    ↓
Create release
```

Il utilise également :

```yaml
SIGNING_KEY
ALIAS
KEY_STORE_PASSWORD
KEY_PASSWORD
```

Il faut donc corriger les secrets de signature de manière cohérente pour les workflows qui signent Yomiku.

Ne pas corriger uniquement le workflow CI si le problème doit également être corrigé pour les releases.

---

# 18. Ne pas modifier inutilement Gradle

Le problème observé ne signifie pas que le code Kotlin, Gradle ou le système de build Android est cassé.

Le build a réussi.

Le problème se situe dans la chaîne :

```text
APK compilé
    ↓
Signature
    ↓
APK distribué
```

Il n'est donc pas nécessaire de modifier le code de l'application uniquement pour résoudre l'erreur de signature.

---

# 19. Résultat attendu

Après correction, GitHub Actions doit produire cette séquence :

```text
Checkout
    ↓
JDK
    ↓
Node.js
    ↓
Gradle
    ↓
assembleRelease
    ↓
Tests
    ↓
Signature APK
    ↓
Vérification apksigner
    ↓
Upload APK signé
```

Et surtout :

```text
Signature échouée
    ↓
BUILD FAILED
```

et non :

```text
Signature échouée
    ↓
APK unsigned
    ↓
Upload
    ↓
Téléchargement
    ↓
"APK non valide"
```

---

# 20. Checklist finale

Avant de relancer le workflow :

- [ ] Le keystore est lisible avec `keytool`.
- [ ] `SIGNING_KEY` contient le keystore Base64.
- [ ] `ALIAS` correspond à l'alias réel.
- [ ] `KEY_STORE_PASSWORD` est correct.
- [ ] `KEY_PASSWORD` est correct.
- [ ] `continue-on-error: true` a été supprimé.
- [ ] Le fallback vers `*.apk` unsigned a été supprimé.
- [ ] Le workflow vérifie qu'un APK signé existe.
- [ ] `apksigner verify --verbose` est exécuté.
- [ ] Aucun fichier `*-unsigned.apk` n'est publié comme APK final.
- [ ] L'APK téléchargé provient de l'étape de signature.
- [ ] L'installation est testée sur le OnePlus Nord N100.

---

# 21. Conclusion

Le build actuel prouve que la compilation de Yomiku fonctionne.

L'erreur vient de la chaîne de signature et surtout du fait que le workflow autorise un échec de signature, puis publie quand même un APK non signé.

La correction prioritaire est donc :

```text
1. Corriger le keystore
2. Corriger les secrets GitHub
3. Retirer continue-on-error
4. Supprimer le fallback unsigned
5. Vérifier la signature avec apksigner
6. Publier uniquement l'APK signé
7. Télécharger et tester cet APK
```

Une fois ces étapes appliquées, le prochain échec de signature fera échouer le workflow au lieu de produire un APK apparemment valide mais impossible à installer.
