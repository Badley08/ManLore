# Bilan des Modifications — Pop-up des Nouveautés (What's New v9.1.0) 🚀⚔️

## 📊 Récapitulatif des Fonctionnalités
- Mise à jour de la pop-up des Nouveautés `whatsNewModal` vers la version v9.1.0 [X]
- Présentation dynamique du Mode Battle ⚔️, du Partage Temporaire et de la Révocation [X]
- Présentation de l'ouverture directe WebApp (Deep Links) et de l'isolation multi-utilisateurs [X]
- Traduction i18n complète (FR, EN, ES) des nouveautés et de l'historique changelog [X]
- Mise à jour des identificateurs de version globale (`WHATS_NEW_VERSION = 'v9.1.0'`) [X]
- Inclusions de fonctionnalités admin dans la pop-up utilisateur [-] (exclues selon la demande)

---

## 🛠️ Détails des Implémentations

### 1. 🚀 Pop-up des Nouveautés (`www/index.html` & `www/app.js`)
- **Version globale** : Passage à la version `v9.1.0` dans `app.js` (`WHATS_NEW_VERSION = 'v9.1.0'`).
- **Cartes de fonctionnalités utilisateur** :
  1. **Arena Mode Battle ⚔️ & Comparateur Duel** : Trophée, jauges de puissance animées, analyse croisée des lectures et chapitres lu.
  2. **Partage Temporaire & Révocation Réciproque** : Durée de 1h à 72h max, révocation cloud instantanée et consultation réciproque des catalogues amis.
  3. **Ouverture WebApp Directe (Deep Links)** : Lancement automatique de l'application WebAPK lors des clics sur liens de partage.
  4. **Isolation des Données Multi-Utilisateurs** : Sécurisation 100% par compte empêchant le mélange de stats sur téléphone partagé.

### 2. 🌍 Traduction Multilingue i18n (`www/i18n.js`)
- Clés `whatsnew.title`, `whatsnew.f1.*`, `whatsnew.f2.*`, `whatsnew.f3.*`, `whatsnew.f4.*` et `changelog.v910.*` ajoutées et traduites en Français, Anglais et Espagnol.
