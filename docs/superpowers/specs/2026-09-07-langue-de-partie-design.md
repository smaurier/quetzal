# Quetzal — La langue d'une partie

**Date** : 2026-09-07
**Statut** : conception validée, prête pour le plan d'implémentation
**Issue** : #40
**Périmètre** : réglage à la création d'une partie de lotería, transport jusqu'aux écrans invités, langue du document
**Hors périmètre** : sélecteur de langue sur la page invité, notion de salle au niveau plateforme

---

## 1. Le problème

La page d'entrée invité `/j/[moduleSlug]/[sessionId]` ne rend aucune barre. La langue y est déduite du `accept-language` de chaque téléphone.

Conséquence dans une classe : la moitié des écrans en français, l'autre en espagnol, selon la configuration personnelle des élèves. Ce n'est pas un choix pédagogique, c'est une absence de choix. Une enseignante qui veut mener une partie en immersion ne peut pas l'obtenir.

## 2. Ce qui a été décidé, et pourquoi

### D1 — Une option, décochée par défaut

Une case à cocher à la création de la partie : « tous les participants voient la partie dans ma langue ». Décochée, chaque appareil garde la sienne — le comportement actuel, à l'identique.

**Raison** : le défaut ne change rien pour personne, donc la fonctionnalité ne peut pas régresser un usage existant. Et l'immersion devient un acte délibéré de l'enseignante plutôt qu'un accident de configuration.

### D2 — La langue est gelée sur la partie

À la création, la langue de l'enseignante est résolue **une fois** et écrite sur la partie. Elle n'est jamais relue en direct.

**Raison** : si on la lisait en direct, une enseignante qui change sa propre langue en cours de partie ferait basculer tous les téléphones de la classe. C'est le même principe que `freezeCards` : ce qui est en jeu ne bouge plus une fois la salle ouverte.

C'est aussi pour cela que la persistance est nécessaire quel que soit le transport — sans elle, un simple rechargement de l'écran animatrice perdrait le réglage et régénérerait un lien différent de celui déjà projeté.

### D3 — Le transport est le lien d'entrée

Le lien porte `&lang=<code>`. Un seul endroit le construit : `animator-page.tsx`, qui y met déjà `tenantId`.

**Raison** : aucun aller-retour serveur dans la coquille, et aucune extension du contrat de module. L'alternative — la coquille demandant au module « quelle est la langue de cette session ? » — serait plus robuste face à d'autres chemins d'entrée, mais il n'en existe aucun aujourd'hui, et elle coûterait une entrée de contrat, une mise à jour de `runContractSuite` et des deux modules existants.

**Le paramètre est une donnée non fiable.** Un élève peut éditer l'URL. Ce n'est pas une frontière de sécurité — c'est une préférence d'affichage, et pouvoir revenir dans sa langue est plutôt une gentillesse. Mais la valeur doit être **validée contre la liste des langues connues** avant d'atteindre quoi que ce soit : une chaîne arbitraire recopiée dans `<html lang>` serait une injection d'attribut.

### D4 — Un seul point d'application : `i18n/request.ts`

`apps/host/src/i18n/request.ts` décide déjà de la langue, et lit déjà `cookies()` et `headers()`. Il gagne une source, en tête de priorité :

```
x-forced-locale (la partie)  →  NEXT_LOCALE (l'utilisateur)  →  accept-language (l'appareil)  →  défaut
```

**Raison, et c'est le point qui simplifie tout le reste** : `layout.tsx` obtient sa langue par `getLocale()`, qui découle de ce fichier. Traiter la langue de partie ici fait donc suivre **à la fois** `<html lang>` et toutes les chaînes traduites, sans modifier la mise en page racine.

Une première esquisse de cette conception lisait l'en-tête dans `layout.tsx` pour n'y corriger que `lang`. Elle aurait traité l'attribut et laissé les chaînes se décider ailleurs, avec le risque durable de les voir diverger.

### D5 — Le middleware transporte, il ne décide pas

Le middleware existe déjà et pose `x-nonce` sur les en-têtes de requête. Il lit le paramètre `lang` de l'URL, le valide, et pose `x-forced-locale` — ou rien.

**Raison** : les composants serveur ne reçoivent pas les paramètres de requête d'une mise en page. Le middleware est le seul endroit qui voit l'URL complète avant le rendu. Il ne fait que passer une valeur validée ; toute la décision reste dans `request.ts`.

## 3. Ce que ça change pour l'accessibilité

C'est la raison pour laquelle `<html lang>` fait partie du périmètre, et non les seules chaînes.

Servir du contenu espagnol dans un document déclaré `lang="fr"` fait prononcer l'espagnol avec la phonétique française par un lecteur d'écran. **RGAA critères 8.3 et 8.4** — langue par défaut présente, et pertinente. Sur une application destinée à l'enseignement des langues, c'est le pire endroit possible pour se tromper.

Traduire les chaînes sans corriger l'attribut aurait donné une fonctionnalité qui paraît marcher et qui dégrade l'accessibilité. C'est le piège de ce chantier.

## 4. Structure

| Élément | Décision |
|---|---|
| Persistance | Colonne `Loto_Game.guestLocale`, nullable. Les réglages de partie sont déjà des colonnes, pas du JSON. |
| Valeur | Un code de `LOCALES`, ou `null` quand l'option est décochée. |
| Résolution | À la création, depuis la langue de l'enseignante. Jamais relue ensuite. |
| Transport | `&lang=` sur le lien d'entrée, construit par `animator-page.tsx`. |
| Validation | Middleware, contre `LOCALES`. Toute autre valeur est ignorée en silence. |
| Application | `i18n/request.ts`, en tête de la chaîne de priorité. |

## 5. Ce qui n'est pas concerné

Les libellés des cartes sont des données du jeu, pas des chaînes d'interface.

Le thème n'a pas de problème équivalent : le bloc `@media (prefers-color-scheme: dark)` donne déjà à un téléphone en sombre l'interface sombre, sans réglage.

## 6. Tests

| Objet | Approche |
|---|---|
| Résolution de la langue | Test unitaire : la chaîne de priorité, ses quatre niveaux, et le repli quand la valeur est inconnue |
| Validation | Test unitaire : une valeur hors `LOCALES` ne produit aucun en-tête — y compris une chaîne contenant un guillemet |
| Gel | Test d'intégration : la partie conserve la langue résolue à sa création, même si l'enseignante change la sienne ensuite |
| Option décochée | Test d'intégration : `guestLocale` reste `null`, le lien ne porte pas `&lang` |
| Langue du document | E2E : le HTML **servi** de la page invité porte `lang="es"` alors que le navigateur annonce `fr` — c'est l'assertion qui couvre RGAA 8.3/8.4 |
| Chaînes | E2E : la même page rend ses libellés en espagnol |
| Non-régression | E2E : les tests existants passent sans modification, l'option étant décochée par défaut |
