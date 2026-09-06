---
name: feature-tracking
description: >-
  Genere et maintient toujours un fichier Markdown de bilan recapitulant les elements ajoutes [X] et non ajoutes [-].
---

# Feature Tracking & Summary Skill

Cette compétence garantit la création systématique d'un fichier Markdown de résumé (`walkthrough.md` ou `SUMMARY.md`) à la fin de chaque intervention pour indiquer clairement ce qui a été ajouté et ce qui ne l'a pas été.

## Syntaxe des Statuts

Pour chaque fonctionnalité ou modification :
- `[X]` pour un élément **Ajouté / Réalisé**
- `[-]` pour un élément **Non ajouté / Ignoré / Non retenu**
- `[ ]` pour un élément **En cours / En attente**

## Exemple de Rendu Markdown

```markdown
# Bilan de la Session

## Statut des Éléments
- Nouveau mode [X]
- Nouveau style [-]
- Intégration i18n [X]
```
