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

**Mais `setStatus` ne sait pas faire ça.** Le port gagne une méthode dédiée,
`advancePattern(gameId): Promise<void>`, qui incrémente l'index sans toucher au statut. Toute la
défense de cette décision repose sur elle : sans méthode propre, l'avance se ferait en détournant
`setStatus`, et le statut redeviendrait porteur d'une information qu'il ne décrit pas.

**Et une figure gagnée en cours de partie doit s'annoncer.** `loto.game.finished` ne convient pas,
la partie n'est pas finie. Le manifeste publie donc un événement de plus, `loto.pattern.won`
(`LotoPatternWonEvent` dans `@quetzal/core/events/loto`), avec la figure, l'équipe et le tirage.
C'est un contrat public inter-module, au même titre que les quatre autres.

### D4 : l'historique vit dans `Loto_Claim`, pas dans une table dédiée

`Loto_Claim` enregistre déjà `teamId`, `atDraw`, `valid` et `claimedAt`. Il ne manque que la figure : une colonne `pattern`.

**Pourquoi pas une table `Loto_Win`** : ce serait un modèle, une migration, un port, une doublure et des tests de plus pour une information qu'une table existante porte aux trois quarts. Et `Loto_Claim` donne en prime les réclamations **ratées** par figure, c'est-à-dire qui a crié trop tôt sur la `linea`, ce qu'une table de victoires ne dirait pas.

`game.wonByTeamId` signifie la gagnante de la **dernière figure effectivement gagnée**.

⚠️ **Et il ne suffit pas à lui seul.** Si l'animatrice termine la partie pendant la figure 2, il
reste `null` alors que la `linea` avait une gagnante. Ce champ ne répond donc pas à « qui a gagné
quoi » : c'est `Loto_Claim` qui y répond, et lui seul. `wonByTeamId` reste ce qu'il est, un
raccourci vers la dernière victoire, jamais l'historique.

**Dénormalisation assumée** : `pattern` sur une réclamation duplique ce que disaient la liste et l'index à cet instant. C'est voulu : l'index de la partie avance, donc la réclamation doit se souvenir de quelle figure elle parlait. Ici c'est juste, pas un symptôme.

### D5 : une réclamation ratée ne coûte rien au tirage où une figure vient d'être gagnée

**Le défaut que l'enchaînement introduit, et qu'il faut nommer.** Aujourd'hui une réclamation
valide termine la partie, donc une seconde réclamation arrivant juste après est rejetée par
`canClaim(status)`. Avec l'enchaînement la partie reste `running` et l'index avance : une
réclamation envoyée au même tirage, portant sur la figure qui vient d'être gagnée, serait évaluée
contre la **suivante**, échouerait, et vaudrait une pénalité à une équipe qui avait raison.

En classe, deux équipes qui crient en même temps est la situation normale, pas le cas limite.

**La règle retenue** : au tirage où une réclamation valide a déjà été enregistrée, une réclamation
ratée ne bloque personne. L'équipe ne gagne pas la figure, la première a crié la première et c'est
le jeu, mais elle n'est pas punie pour avoir eu raison une seconde trop tard.

**Pourquoi pas faire porter la figure par la réclamation du client** : ce serait faire du client la
source d'une donnée de jugement, la surface exacte que `readForcedLocale` sert à supprimer
ailleurs. Et deux gagnantes pour une même figure est une notion que `wonByTeamId` au singulier ne
sait pas dire.

**Et ça ne demande aucune donnée nouvelle** : `Loto_Claim` enregistre déjà `atDraw` et `valid`. Le
garde-fou est une lecture, `hasValidClaimAt(gameId, atDraw)`, sur la table que D4 utilise déjà.

**Conséquence assumée, héritée de D2** : la pénalité d'une fausse réclamation prise à la fin d'une
figure déborde sur la suivante, puisque les tirages s'accumulent. C'est cohérent avec la
continuité, et aucune remise à zéro n'est faite.

### D6 : une chaîne de caractères, pas un tableau Postgres

`patterns String` porte les clés séparées par une virgule (`"linea,llena"`), et `patternIndex Int @default(0)` dit où l'on en est.

**La base stocke une chaîne, le port expose un tableau.** `GameSettings.patterns` est un `PatternKey[]` et c'est le dépôt Prisma qui traduit dans les deux sens, comme il retype déjà `status` et `pattern` au lieu de rendre des chaînes nues. Le domaine et l'application ne voient jamais la chaîne.

`CLAUDE.md` §9 interdit les enums Postgres et préfère String avec validation Zod. Une liste de une à quatre clés courtes ne mérite pas davantage, et la validation à l'entrée reste la seule garantie qui compte.

### D7 : la migration a un ordre imposé, et une étape de remplissage

⛔ **C'est le piège rencontré le 04/11 sur `account.issuer`** : une colonne `NOT NULL` sans valeur
par défaut fait échouer le déploiement sur les lignes existantes. `Loto_Claim.pattern` est
exactement ce cas, les réclamations déjà en base n'ayant pas de figure.

L'ordre est donc contraint, en une seule migration :

1. ajouter `Loto_Claim.pattern` **nullable** ;
2. le remplir depuis `Loto_Game.pattern`, par jointure sur `gameId` et `tenantId` ;
3. le passer en `NOT NULL` ;
4. ajouter `Loto_Game.patterns` et `patternIndex`, remplir `patterns` depuis `pattern` ;
5. retirer `Loto_Game.pattern`.

Inverser 2 et 5 détruirait la donnée qui sert à remplir. Le SQL généré sera lu avant d'être écrit,
et la migration créée contre un Postgres **local**, jamais Neon.

### D8 : la liste est bornée, ordonnée, et sans doublon

De une à quatre figures, l'ordre est celui que l'animatrice a coché, et une même figure ne peut y
figurer qu'une fois. Rejouer la même figure deux fois de suite n'a pas de sens : la seconde serait
gagnée au tirage suivant par la même équipe.

`patterns String @db.VarChar(64)`, borné comme `pattern` l'était en `VarChar(16)` : quatre clés et
leurs virgules tiennent largement, et une colonne non bornée irait contre le style du fichier.

## 3. Ce que ça change pour chaque écran

**L'animatrice** coche les figures à la création, dans l'ordre, et son écran affiche où en est la partie : « figure 2 sur 3 : llena ».

**Les invités** reçoivent la figure courante dans l'instantané, et une diffusion `pattern-changed` quand elle avance. Rien d'autre ne bouge chez eux : mêmes tablas, mêmes marquages, mêmes cartes tirées.

**Le QR et le lien d'entrée** ne sont pas concernés.

## 4. Structure

| Fichier | Changement |
|---|---|
| `packages/module-loto/prisma/models.prisma` | `Loto_Game` : `patterns String @db.VarChar(64)`, `patternIndex Int @default(0)`, retrait de `pattern` · `Loto_Claim` : `pattern String @db.VarChar(16)` |
| migration Prisma | transforme `pattern` en `patterns` à une seule entrée |
| `src/domain/pattern.ts` | une fonction pure pour lire et écrire la liste |
| `src/domain/ports/game.repository.ts` | `GameSettings.patterns: PatternKey[]`, `GameState.patternIndex: number` |
| `src/domain/ports/game.repository.ts` | `advancePattern(gameId)` et `hasValidClaimAt(gameId, atDraw)` |
| `src/application/claim.use-case.ts` | avance l'index ou termine la partie, et ne pénalise pas au tirage d'une victoire |
| `packages/core/src/events/loto.ts` | `LotoPatternWonEvent` |
| `src/manifest.ts` | `loto.pattern.won` dans `eventsPublished` |
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

**Le cas de la course, à prouver** : deux réclamations au même tirage sur la figure qui vient
d'être gagnée. La seconde ne gagne pas et **n'est pas bloquée**.

**La migration, à prouver sur des données existantes** : une partie et une réclamation posées
avant migration doivent se relire après, avec la figure remplie et non nulle.

**E2E** : une partie à deux figures, menée jusqu'à la seconde, avec la progression lisible à l'écran de l'animatrice.
