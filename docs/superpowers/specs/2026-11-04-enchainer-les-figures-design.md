# Quetzal : enchaîner plusieurs figures dans une même partie

> **Issue** : #30 · **Dette** : plan du sous-projet 2, § dette n°5

## 1. Le problème

Une partie de Lotería a aujourd'hui **une seule figure gagnante**, fixée à la création. Pour jouer une `linea` puis une `llena`, l'animatrice doit recréer une partie : nouveau code d'entrée, nouveau scan par chaque téléphone, nouvelle attribution des équipes. En classe, c'est une rupture de plusieurs minutes.

Le déclencheur enregistré dans l'issue est précis : enchaîner `linea` puis `llena` sans recréer de partie.

Le domaine s'y prête déjà. Les quatre figures sont des **prédicats purs et interchangeables** : `isWinningClaim({ tablaCardIds, drawnCardIds, pattern })` ne sait rien du reste. Ce qui change, c'est la machine à états et l'écran animateur.

## 2. Ce qui a été décidé, et pourquoi

### D1 : la liste est fixée à la création, pas choisie en direct

L'animatrice coche les figures voulues, dans l'ordre, en créant la partie. Le jeu les enchaîne.

**Pourquoi pas le choix en direct**, qui semblait plus souple : il impose un état d'attente entre deux figures (« gagnée, on attend que l'animatrice décide »), donc un cinquième statut dans `GAME_STATUSES`. Or chaque statut irrigue l'instantané, la passerelle, les deux écrans et les E2E. C'est la différence entre un changement contenu et un changement qui ruisselle.

Et la souplesse cherchée existe déjà à moitié : si la séance doit s'arrêter, la transition `running → finished` est là.

**Ce choix n'est pas une impasse.** La liste et l'index restent le bon modèle si l'on veut un jour dévier en cours de partie : il suffira d'ajouter une mutation, rien de ce qui est écrit ici ne sera jeté.

### D2 : tout continue d'une figure à l'autre, tirage compris

Mêmes tablas, et les cartes déjà tirées restent tirées. C'est la Lotería « acumulada », la façon dont le jeu se joue réellement.

**Pourquoi pas une remise à zéro du tirage** : le coût est dans les marquages. Un marquage de joueur correspond à une carte tirée. Vider les tirages en gardant les tablas obligerait à vider tous les marquages **et** à les pousser à chaque téléphone connecté, ce qui ajoute une diffusion, un état client à réinitialiser et un nouveau mode de panne. Avec la continuité, il n'y a rien à réinitialiser.

**Le défaut assumé** : la `llena` peut tomber peu après la `linea`, ce qui fait un deuxième acte rapide. C'est l'animatrice qui le règle en choisissant l'ordre, et la `llena` demande de toute façon presque tout le paquet.

### D3 : la machine à états ne gagne aucun statut

Une réclamation valide fait désormais **soit** avancer `patternIndex`, **soit** terminer la partie si c'était la dernière figure. Le statut reste `running` entre les figures.

C'est la décision qui contient le chantier. `GAME_STATUSES` et `canTransition` ne sont pas touchés.

### D4 : l'historique vit dans `Loto_Claim`, pas dans une table dédiée

`Loto_Claim` enregistre déjà `teamId`, `atDraw`, `valid` et `claimedAt`. Il ne manque que la figure : une colonne `pattern`.

**Pourquoi pas une table `Loto_Win`** : ce serait un modèle, une migration, un port, une doublure et des tests de plus pour une information qu'une table existante porte aux trois quarts. Et `Loto_Claim` donne en prime les réclamations **ratées** par figure, c'est-à-dire qui a crié trop tôt sur la `linea`, ce qu'une table de victoires ne dirait pas.

`game.wonByTeamId` garde un sens net : la gagnante de la **dernière** figure, donc de la partie.

**Dénormalisation assumée** : `pattern` sur une réclamation duplique ce que disaient la liste et l'index à cet instant. C'est voulu : l'index de la partie avance, donc la réclamation doit se souvenir de quelle figure elle parlait. Ici c'est juste, pas un symptôme.

### D5 : une chaîne de caractères, pas un tableau Postgres

`patterns String` porte les clés séparées par une virgule (`"linea,llena"`), et `patternIndex Int @default(0)` dit où l'on en est.

**La base stocke une chaîne, le port expose un tableau.** `GameSettings.patterns` est un `PatternKey[]` et c'est le dépôt Prisma qui traduit dans les deux sens, comme il retype déjà `status` et `pattern` au lieu de rendre des chaînes nues. Le domaine et l'application ne voient jamais la chaîne.

`CLAUDE.md` §9 interdit les enums Postgres et préfère String avec validation Zod. Une liste de une à quatre clés courtes ne mérite pas davantage, et la validation à l'entrée reste la seule garantie qui compte.

## 3. Ce que ça change pour chaque écran

**L'animatrice** coche les figures à la création, dans l'ordre, et son écran affiche où en est la partie : « figure 2 sur 3 : llena ».

**Les invités** reçoivent la figure courante dans l'instantané, et une diffusion `pattern-changed` quand elle avance. Rien d'autre ne bouge chez eux : mêmes tablas, mêmes marquages, mêmes cartes tirées.

**Le QR et le lien d'entrée** ne sont pas concernés.

## 4. Structure

| Fichier | Changement |
|---|---|
| `packages/module-loto/prisma/models.prisma` | `Loto_Game` : `patterns String`, `patternIndex Int @default(0)`, retrait de `pattern` · `Loto_Claim` : `pattern String @db.VarChar(16)` |
| migration Prisma | transforme `pattern` en `patterns` à une seule entrée |
| `src/domain/pattern.ts` | une fonction pure pour lire et écrire la liste |
| `src/domain/ports/game.repository.ts` | `GameSettings.patterns: PatternKey[]`, `GameState.patternIndex: number` |
| `src/application/claim.use-case.ts` | avance l'index ou termine la partie |
| `src/application/game-snapshot.use-case.ts` | la figure courante et la progression |
| `src/presentation/dto/loto.dto.ts` | validation de la liste |
| `src/presentation/game.controller.ts` | passe la liste |
| `src/presentation/loto.broadcaster.ts` | `pattern-changed` |
| `src/presentation/ui/decks-page.tsx` | choix des figures, dans l'ordre |
| `src/presentation/ui/animator-page.tsx` | la progression |
| `src/i18n/{fr,en,es}.json` | libellés de progression |

## 5. Ce qui n'est pas concerné

- **Dévier la liste en cours de partie.** Reporté explicitement, voir D1.
- **La rétrocompatibilité en double.** La migration transforme `pattern` en `patterns` à une seule entrée : les parties déjà en base restent valides. La colonne `pattern` n'est pas conservée en doublon.
- **Le domaine des figures.** `matchesPattern` et `isWinningClaim` ne changent pas d'une ligne. On leur passe la figure courante au lieu de la figure unique.
- **Les tablas et les marquages.** Voir D2.

## 6. Tests

**Unitaire, le cœur** : l'avance d'index. Dernière figure gagnée → la partie se termine ; sinon → l'index avance et le statut reste `running`.

**Unitaire** : la lecture et l'écriture de la liste de figures, et son refus quand elle est vide ou qu'elle contient une clé inconnue.

**Intégration** : l'aller-retour en base de la liste et de l'index, et la colonne `pattern` d'une réclamation.

**Le cas limite à prouver** : une tabla déjà complète au moment où la `linea` est gagnée doit pouvoir réclamer la `llena` au tirage suivant, sans que l'enchaînement sourcille.

**E2E** : une partie à deux figures, menée jusqu'à la seconde, avec la progression lisible à l'écran de l'animatrice.
