# Quetzal — Sous-projet 2 : module Lotería

**Date** : 2026-09-03
**Statut** : conception validée, prête pour le plan d'implémentation
**Paquet** : `packages/module-loto`
**Prérequis** : noyau du sous-projet 1 en production (contrat de module à deux entrées, identité WS au handshake, matrice de permissions, tenant scope Prisma, event bus, i18n)

---

## 1. Objectif

Livrer le premier vrai module métier de Quetzal : une lotería mexicaine jouable en classe, où l'enseignante compose ses propres jeux de cartes et anime la partie depuis son écran pendant que les élèves jouent sur leur téléphone.

Le module doit prouver que le contrat posé au sous-projet 1 tient sous une charge métier réelle : temps réel multi-joueurs, identité invité, état persistant, contenu créé par l'utilisateur.

## 2. Public et scénario de référence

**Utilisatrice** : Elda, professeure d'espagnol, seule utilisatrice du MVP.

**Séance type.** Elda a préparé un jeu de cartes en amont, soit en dupliquant la lotería traditionnelle et en y mettant les photos de son propre jeu, soit en créant un jeu de vocabulaire sur le thème du moment. En classe, elle crée une partie, projette l'écran animateur, les élèves scannent le QR et rejoignent. Elle annonce le modèle de victoire, puis tire les cartes une par une en prononçant chaque nom et en laissant le temps de chercher. Les élèves marquent sur leur téléphone. Une équipe crie, réclame, le serveur valide, la partie s'arrête.

**Contexte matériel** : salle de classe, wifi d'établissement peu fiable, entre quinze et trente-cinq élèves, un vidéoprojecteur, un nombre de téléphones variable.

## 3. Périmètre

### 3.1 Dans le périmètre

| Domaine | Contenu |
|---|---|
| Jeux de cartes | Lotería traditionnelle livrée comme modèle, duplication, création de zéro, édition du nom et de l'image carte par carte, suppression |
| Images | Envoi depuis navigateur ou téléphone, redimensionnement côté client, rendu de repli typographique quand l'image manque |
| Partie | Création avec réglages, code court et QR, salle d'attente, tirage manuel, historique des parties |
| Équipes | Répartition automatique au-delà du nombre maximum d'équipes, tabla partagée, marquage synchronisé entre coéquipiers |
| Jeu | Quatre figures gagnantes, réclamation par le joueur, validation serveur, pénalité de fausse réclamation réglable |
| Robustesse | Reprise complète de l'état à la reconnexion |

### 3.2 Hors périmètre, assumé

Tirage automatique et minuteur. Plusieurs figures successives dans une même partie. Score cumulé entre parties. Chat. Son et synthèse vocale. Impression de tablas papier. Génération d'illustrations par IA. Redis. Import ou export de jeux de cartes. Partage d'un jeu entre locataires.

### 3.3 Contraintes issues du jeu

- Une tabla fait quatre sur quatre, soit seize cases.
- Un jeu de cartes doit donc contenir au moins seize cartes.
- La lotería traditionnelle en compte cinquante-quatre.

## 4. Décisions de conception

Chaque décision porte sa raison, pour que le plan n'ait pas à les redécouvrir.

### D1 — Le serveur ne fait jamais confiance au marquage du client

La validation d'une réclamation ne lit jamais ce que le téléphone prétend avoir marqué. Le serveur croise les seize cartes de la tabla avec l'ensemble des cartes réellement tirées, dont il est seul dépositaire, puis applique le prédicat de figure.

**Conséquence** : la triche par marquage falsifié n'a pas besoin d'être détectée, elle est sans objet. C'est l'invariant central du module et le premier à tester.

### D2 — Le marquage est un état partagé sans autorité

Les marquages sont persistés et diffusés aux coéquipiers, parce qu'une tabla d'équipe doit être vue à l'identique par tous et survivre à une coupure réseau. Ils ne participent jamais à une décision de jeu.

Cette phrase doit rester dans le code, à côté du type qui les porte : c'est le point exact où une optimisation naïve réintroduirait la faille fermée par D1.

### D3 — Un joueur seul est une équipe d'un

Le domaine ne connaît que des équipes. Une partie a un nombre maximum d'équipes, six par défaut, réglable. Tant qu'il y a moins de joueurs que ce maximum, chacun forme sa propre équipe et possède sa tabla. Au-delà, le serveur répartit les arrivants dans les équipes existantes en équilibrant les effectifs.

Les équipes seront donc souvent inégales, ce qui est sans effet sur le jeu : chaque équipe a une tabla et seize cases.

**Conséquence** : l'usage « un seul téléphone par équipe, les autres regardent » ne demande aucun code. C'est un cas dégénéré du même modèle, décidé en classe.

### D4 — Le tirage est manuel

Aucun minuteur, aucun ordonnanceur, aucun état temporel côté serveur. Le tirage est le moment pédagogique : l'enseignante prononce, fait répéter, explique. Un intervalle automatique lui retirerait précisément ce contrôle, en échange d'un ordonnanceur, d'une reprise après redémarrage et d'une dérive d'horloge entre clients.

La pénalité de fausse réclamation se compte donc **en tours de tirage** et non en secondes, ce qui reste cohérent en l'absence d'horloge partagée.

### D5 — La partie fige son jeu de cartes au lancement

Au démarrage, la partie copie les cartes dont elle a besoin. S'y ajoutent deux règles simples :

- un jeu de cartes ne peut pas être modifié tant qu'une partie qui l'utilise est en cours ;
- supprimer un jeu de cartes supprime aussi l'historique des parties qui s'y rattachent, après avertissement explicite.

**Conséquence** : l'historique ne peut jamais mentir, aucune partie en cours ne peut référencer une carte disparue, et Elda garde la liberté d'éditer ses jeux entre deux séances.

### D6 — Les images vivent en base derrière un port

Les images sont stockées dans Postgres et servies par une route de l'API avec un cache long et une adresse dérivée du contenu. L'accès passe par un port, au même titre que les dépôts.

**Raison** : une carte redimensionnée pèse quelques dizaines de kilooctets, un jeu complet quelques mégaoctets, à comparer au palier gratuit de Neon. Aucun service supplémentaire, aucun secret de plus, cloisonnement par locataire hérité de l'extension Prisma.

**Déclencheur de migration, à écrire dans la dette** : le jour où un deuxième module a besoin d'images, la capacité remonte au niveau de la plateforme et bascule sur un stockage objet servi par CDN. Le port rend ce basculement équivalent au remplacement d'un adaptateur.

### D7 — Les commandes en HTTP, la diffusion en WebSocket

Créer une partie, la lancer, tirer une carte sont des actions ponctuelles de l'animateur qui méritent un code de retour et une idempotence claire. Elles passent en HTTP. Le WebSocket ne sert qu'à diffuser l'état aux participants.

### D8 — Vocabulaire du domaine

Le code emploie les mots du jeu : `Deck`, `Card`, `Tabla`, `Draw`, `Claim`, `Team`. La spec du noyau esquissait `Loto_Ticket`, remplacé par `Loto_Tabla`.

## 5. Modèle de domaine

Couche pure, sans framework, testée exhaustivement.

### 5.1 Tabla

Une tabla est une séquence ordonnée de seize identifiants de cartes, sans répétition, tirés du jeu figé de la partie.

**Génération** : tirage aléatoire sans remise parmi les cartes du jeu. Deux équipes d'une même partie ont des tablas différentes ; l'unicité est vérifiée à la génération et retentée en cas de collision.

**L'unicité porte sur la séquence ordonnée, jamais sur l'ensemble des cartes.** Avec un jeu de seize cartes exactement, cas explicitement supporté, toute tabla contient les mêmes seize cartes : une comparaison par ensemble collisionnerait à chaque tentative et bouclerait indéfiniment. La séquence, elle, offre seize factorielle arrangements. C'est aussi la bonne règle de jeu : ce qu'un élève voit, c'est la disposition, pas le multiensemble. Le nombre de tentatives est borné et l'épuisement lève une erreur de domaine, pour qu'un défaut futur échoue vite au lieu de figer une classe.

### 5.2 Figure

Une figure est un prédicat pur sur une grille de seize booléens, indexée ligne par ligne.

| Clé | Nom | Définition |
|---|---|---|
| `linea` | Línea | une ligne, une colonne ou une diagonale complète |
| `esquinas` | Cuatro esquinas | les quatre coins |
| `centro` | El centro | le carré central de deux sur deux |
| `llena` | Lotería llena | les seize cases |

Les quatre implémentent la même interface. En ajouter une cinquième ne touche à rien d'autre.

### 5.3 Validation de réclamation

Entrées : la tabla de l'équipe, l'ensemble des cartes tirées, la figure de la partie.

Traitement : projeter la tabla en grille de booléens par appartenance à l'ensemble tiré, puis appliquer le prédicat.

Aucune autre entrée. En particulier, jamais les marquages.

**L'ensemble des cartes tirées porte un type brand.** Une chaîne ne devient un identifiant de carte tirée qu'en passant par une fabrique unique, dont le paramètre nomme sa provenance : le registre des tirages du serveur. Sans cela, D1 ne tiendrait que par la vigilance : dans le dépôt, la tabla d'une équipe et son marquage sont deux tableaux de chaînes voisins, et l'appel catastrophique ne diffère du bon que d'un identifiant. Avec le brand, cet appel ne compile pas. C'est la différence entre un invariant et une convention.

### 5.4 État d'une partie

`draft` → `open` → `running` → `finished`

| Transition | Déclencheur | Effet |
|---|---|---|
| `draft` → `open` | l'animateur ouvre la salle | le jeu est figé, le code d'entrée devient actif |
| `open` → `running` | premier tirage | les entrées sont closes |
| `running` → `finished` | réclamation valide, ou arrêt par l'animateur | plus aucun tirage ni réclamation |
| `open` → `finished` | l'animatrice referme une partie que personne n'a jouée | la salle d'attente se vide, aucun tirage n'a eu lieu |

Un élève ne peut rejoindre qu'à l'état `open`. C'est le comportement d'une classe : on attend que tout le monde soit entré, puis on commence.

Le premier tirage porte deux effets qui ne se séparent pas : il enregistre la carte **et** fait basculer la partie de `open` à `running`. Les dissocier produirait une partie qui accumule des tirages en restant `open`, donc où toute réclamation est refusée : un écran parfaitement normal et une partie ingagnable. Le cas d'usage du tirage doit rendre les deux atomiques.

### 5.5 Deux façons d'entrer, un seul identifiant

La partie est la session au sens de la plateforme : `Loto_Game.id` est le `sessionId` que porte le jeton invité et que contient l'adresse d'entrée `/j/loto/<id>`. Le QR encode cette adresse.

Le code court est un second chemin vers la même partie, pour l'élève sans appareil photo utilisable ou dont le QR ne passe pas. Il se résout en identifiant de partie avant l'émission du jeton invité, et n'existe donc que dans l'écran d'entrée.

## 6. Modèle de données

Conventions du projet : préfixe du module, clé composite, `tenantId` en chaîne simple parce qu'il référence une organisation Better-Auth, aucune énumération Postgres.

```prisma
model Loto_Deck {
  id          String
  tenantId    String
  name        String   @db.VarChar(120)
  isTemplate  Boolean  @default(false)   // la lotería traditionnelle livrée
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cards       Loto_Card[]
  games       Loto_Game[]

  @@id([id, tenantId])
  @@index([tenantId, name])
}

model Loto_Card {
  id        String
  tenantId  String
  deckId    String
  rank      Int                          // 1..n, l'ordre traditionnel
  label     String  @db.VarChar(80)
  imageId   String?                      // null = rendu typographique

  deck      Loto_Deck  @relation(fields: [deckId, tenantId], references: [id, tenantId], onDelete: Cascade)
  // imageId est une référence simple, sans relation Prisma : même traitement que
  // Loto_GameCard, et pas de clé étrangère composite partiellement facultative.

  @@id([id, tenantId])
  @@unique([deckId, rank, tenantId])
  @@index([tenantId, deckId])
}

model Loto_CardImage {
  id          String
  tenantId    String
  contentHash String   @db.VarChar(64)   // adresse stable, cache immuable
  mimeType    String   @db.VarChar(40)
  bytes       Bytes
  createdAt   DateTime @default(now())

  @@id([id, tenantId])
  @@unique([contentHash, tenantId])
}

model Loto_Game {
  id                     String
  tenantId               String
  deckId                 String
  status                 String   @db.VarChar(16) @default("draft")
  pattern                String   @db.VarChar(16)
  falseClaimPenaltyDraws Int      @default(0)     // 0 = aucune pénalité
  maxTeams               Int      @default(6)
  joinCode               String   @db.VarChar(8)
  createdBy              String
  createdAt              DateTime @default(now())
  startedAt              DateTime?
  finishedAt             DateTime?
  wonByTeamId            String?

  deck        Loto_Deck        @relation(fields: [deckId, tenantId], references: [id, tenantId], onDelete: Cascade)
  frozenCards Loto_GameCard[]
  teams       Loto_Team[]
  draws       Loto_Draw[]
  claims      Loto_Claim[]

  @@id([id, tenantId])
  @@unique([joinCode, tenantId])
  @@index([tenantId, status, createdAt])
}

model Loto_GameCard {
  id        String
  tenantId  String
  gameId    String
  rank      Int
  label     String  @db.VarChar(80)
  imageId   String?

  game      Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([gameId, rank, tenantId])
}

model Loto_Team {
  id             String
  tenantId       String
  gameId         String
  name           String  @db.VarChar(60)
  cardIds        Json                     // les 16 Loto_GameCard.id de la tabla
  markedCardIds  Json                     // état partagé, sans autorité (D2)
  blockedUntilDraw Int   @default(0)      // pénalité de fausse réclamation

  game     Loto_Game     @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)
  members  Loto_Member[]

  @@id([id, tenantId])
  @@index([tenantId, gameId])
}

model Loto_Member {
  id          String
  tenantId    String
  gameId      String                       // dénormalisé : porte l'unicité de l'invité
  teamId      String
  guestId     String   @db.VarChar(64)
  displayName String   @db.VarChar(32)
  joinedAt    DateTime @default(now())

  team  Loto_Team @relation(fields: [teamId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([gameId, guestId, tenantId])    // une reconnexion retrouve son équipe
  @@index([tenantId, teamId])
}

model Loto_Draw {
  id        String
  tenantId  String
  gameId    String
  order     Int                            // 1..n, fait autorité
  cardId    String
  drawnAt   DateTime @default(now())

  game  Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([gameId, order, tenantId])
  @@unique([gameId, cardId, tenantId])     // une carte ne sort qu'une fois
}

model Loto_Claim {
  id         String
  tenantId   String
  gameId     String
  teamId     String
  atDraw     Int
  valid      Boolean
  claimedAt  DateTime @default(now())

  game  Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@index([tenantId, gameId, claimedAt])
}
```

Valeurs contraintes par `CHECK` SQL et par Zod côté application, jamais par une énumération Postgres :

- `Loto_Game.status` ∈ `draft`, `open`, `running`, `finished`
- `Loto_Game.pattern` ∈ `linea`, `esquinas`, `centro`, `llena`

### 6.1 Points de sémantique à ne pas laisser au hasard

**Nom d'équipe.** Une équipe d'un porte le nom d'affichage de son membre. Dès qu'elle en compte plusieurs, elle porte un nom numéroté traduit, `Equipo 1` et suivants. Le renommage par l'animatrice n'est pas dans le périmètre.

**Blocage après fausse réclamation.** `blockedUntilDraw` contient le rang de tirage à partir duquel l'équipe peut réclamer de nouveau. Une réclamation est refusée tant que le rang du dernier tirage est **strictement inférieur** à cette valeur. Une fausse réclamation au douzième tirage avec une pénalité de trois tours donne quinze. La valeur zéro signifie qu'aucune pénalité ne court.

**Deux tirages simultanés.** Un double appui sur le bouton ne peut pas produire deux cartes au même rang ni sortir deux fois la même carte : les deux contraintes d'unicité de `Loto_Draw` l'interdisent en base. Le cas d'usage traite l'échec d'insertion comme une absence d'effet et renvoie l'état courant, ce qui rend le tirage idempotent du point de vue de l'animatrice.

**Cycle de vie des images.** Cette version ne supprime jamais une image. Supprimer un jeu de cartes laisse donc des images orphelines en base. C'est accepté au volume visé et inscrit en dette : le nettoyage viendra avec la remontée du stockage au niveau de la plateforme.

## 7. Jeu de cartes livré

Le module amorce un jeu `isTemplate = true` nommé « Lotería tradicional », cinquante-quatre cartes, noms espagnols dans l'ordre traditionnel, sans image.

`1 El gallo · 2 El diablito · 3 La dama · 4 El catrín · 5 El paraguas · 6 La sirena · 7 La escalera · 8 La botella · 9 El barril · 10 El árbol · 11 El melón · 12 El valiente · 13 El gorrito · 14 La muerte · 15 La pera · 16 La bandera · 17 El bandolón · 18 El violoncello · 19 La garza · 20 El pájaro · 21 La mano · 22 La bota · 23 La luna · 24 El cotorro · 25 El borracho · 26 El negrito · 27 El corazón · 28 La sandía · 29 El tambor · 30 El camarón · 31 Las jaras · 32 El músico · 33 La araña · 34 El soldado · 35 La estrella · 36 El cazo · 37 El mundo · 38 El apache · 39 El nopal · 40 El alacrán · 41 La rosa · 42 La calavera · 43 La campana · 44 El cantarito · 45 El venado · 46 El sol · 47 La corona · 48 La chalupa · 49 El pino · 50 El pescado · 51 La palma · 52 La maceta · 53 El arpa · 54 La rana`

**Point de contenu à trancher par Elda** : les cartes 26 et 38 portent des noms et des illustrations traditionnelles datées, que plusieurs éditions modernes ont renommées. Le modèle livré garde la liste canonique ; la duplication permet de les renommer en un geste. C'est une décision de contenu, pas de code, et elle appartient à l'enseignante.

## 8. Contrat du module

### 8.1 Manifeste

Deux entrées comme le veut le contrat : `./manifest` côté serveur, `./client` côté hôte.

Points notables du manifeste serveur :

- `slug: 'loto'`
- `guestAccess.enabled: true`, nom d'affichage requis, quota par session aligné sur une classe
- `prismaModels: 'prisma/models.prisma'`
- `eventsPublished` : `loto.game.started`, `loto.card.drawn`, `loto.claim.rejected`, `loto.game.finished`, avec leurs types exportés depuis `@quetzal/core/events/loto`, ce que la suite de contrat vérifie
- `uiRoutes` : la gestion des jeux de cartes et l'écran animateur, réservés aux rôles qui peuvent créer
- `navItem` : entrée de barre latérale, libellé traduit
- `guestJoinComponent` : l'écran joueur

### 8.2 Catalogues de traduction

Le module livre ses catalogues en français, anglais et espagnol sous `src/i18n/`, avec parité stricte des clés, que la suite de contrat vérifie. Ils sont fusionnés dans les catalogues de l'hôte au build, mécanisme réparé le 03/09.

L'espagnol a ici un statut particulier : c'est la langue du jeu et celle du cours. Les noms des cinquante-quatre cartes ne sont pas des clés de traduction mais des données, portées par le jeu de cartes et modifiables par l'enseignante.

### 8.3 Matrice de permissions

Tout message et toute route y figurent : depuis le sous-projet 1, le noyau refuse par défaut ce qui n'est pas déclaré.

| Clé | Rôles |
|---|---|
| `http:GET /api/modules/loto/decks` | owner, creator |
| `http:POST /api/modules/loto/decks` | owner, creator |
| `http:PATCH /api/modules/loto/decks/:id` | owner, creator |
| `http:DELETE /api/modules/loto/decks/:id` | owner, creator |
| `http:POST /api/modules/loto/decks/:id/cards/:rank/image` | owner, creator |
| `http:GET /api/modules/loto/images/:hash` | owner, creator, learner, guest |
| `http:POST /api/modules/loto/games` | owner, creator |
| `http:POST /api/modules/loto/games/:id/open` | owner, creator |
| `http:POST /api/modules/loto/games/:id/draw` | owner, creator |
| `http:POST /api/modules/loto/games/:id/finish` | owner, creator |
| `http:GET /api/modules/loto/games` | owner, creator |
| `ws:mark` | guest, learner |
| `ws:claim` | guest, learner |

Il n'existe pas de message d'entrée. L'affectation à une équipe se fait **à la connexion**, à partir de l'identité que la plateforme a déjà posée sur le socket au handshake, et elle est idempotente par identifiant d'invité. Une reconnexion retrouve donc son équipe au lieu d'en créer une seconde, et l'écran joueur n'a pas de fenêtre pendant laquelle il serait connecté sans tabla.

### 8.4 Événements diffusés

| Événement | Salle | Charge utile |
|---|---|---|
| `state` | socket qui vient de se connecter | état complet : partie, tabla, tirages, marquages, blocage |
| `team-joined` | partie | équipe, effectif |
| `card-drawn` | partie | rang du tirage, carte |
| `mark-changed` | équipe | carte, marquée ou non, auteur |
| `claim-result` | partie | équipe, valide ou non, pénalité éventuelle |
| `game-finished` | partie | équipe gagnante, figure |

Les noms de salle passent par l'assistant du noyau, jamais par une chaîne construite à la main.

## 9. Images

**Envoi.** L'animatrice choisit un fichier ou prend une photo. Le navigateur redimensionne avant l'envoi : côté le plus long ramené à huit cents pixels, encodage WebP avec repli JPEG. Sans ce redimensionnement, une classe qui charge trente tablas met la connexion de l'établissement à genoux.

**Stockage.** Une empreinte du contenu sert de clé, ce qui déduplique naturellement quand la même image sert deux cartes et rend l'adresse immuable.

**Service.** Route dédiée, `Cache-Control` long et immuable puisque l'adresse dépend du contenu.

**Chargement.** Les images d'une tabla sont préchargées pendant la salle d'attente, ce qui étale la charge sur la durée des connexions au lieu de la concentrer au premier tirage.

**Repli.** Une carte sans image s'affiche en typographie. Le jeu est donc pleinement jouable avant qu'une seule image existe, ce qui rend le développement et les tests indépendants de la production des visuels.

## 10. Écrans

### 10.1 Gestion des jeux de cartes

Liste des jeux, duplication du modèle, création vierge, suppression avec avertissement explicite sur la perte de l'historique associé.

Édition d'un jeu : grille des cartes, chacune éditable en nom et en image. Le compteur de cartes signale quand le jeu passe sous le minimum jouable.

### 10.2 Écran animateur

C'est l'écran projeté, donc lisible à distance.

**Salle d'attente** : code d'entrée en très grand, QR, liste des équipes qui se remplissent, réglages rappelés, bouton de lancement.

**En partie** : carte tirée en très grand, bouton de tirage, ruban des cartes déjà sorties, fil des réclamations, compteur de cartes restantes, bannière de victoire.

### 10.3 Écran joueur

Téléphone, une seule colonne. Carte tirée en haut, tabla dessous, marquage au doigt, bouton de réclamation. Indication de blocage quand une pénalité court. Rien d'autre.

### 10.4 Entrée invité

La page d'entrée de la plateforme sert telle quelle, sans modification.

## 11. Ordre de construction

L'ordre suit la jouabilité, pas l'architecture, pour que la première séance en classe arrive tôt et qu'une interruption laisse un état utilisable.

| Étape | Contenu | Fin d'étape |
|---|---|---|
| 1 | Domaine complet, testé exhaustivement | figures, tablas, validation de réclamation, machine à états |
| 2 | Persistance et cas d'usage | dépôts Prisma, création de partie, tirage, réclamation |
| 3 | Temps réel et écrans | passerelle, salles, écran animateur, écran joueur, entrée invité |
| 4 | **Partie jouable** avec la lotería traditionnelle en noms seuls | **première séance possible en classe** |
| 5 | Éditeur de jeux de cartes | duplication, création, édition des noms |
| 6 | Images | envoi, redimensionnement, stockage, service, préchargement |

Les étapes une à quatre livrent un module utilisable. Les étapes cinq et six ajoutent la valeur pédagogique durable. Une interruption pour la certification d'octobre s'arrête proprement à la fin de l'étape quatre.

## 12. Tests

| Couche | Approche |
|---|---|
| Domaine | Unitaires exhaustifs. Les quatre figures sur grilles construites à la main, y compris les quasi-figures. Génération de tabla : taille, unicité, appartenance au jeu. Validation de réclamation, dont le cas où le client prétend avoir marqué une carte jamais tirée. Machine à états, transitions interdites comprises. |
| Application | Cas d'usage contre dépôts factices. Répartition en équipes, dont les effectifs inégaux. Pénalité en tours. Verrou d'édition pendant une partie. **Le cas adversarial de D1 vit ici et nulle part ailleurs** : une équipe dont le marquage dessine une línea parfaite alors que rien n'a été tiré voit sa réclamation refusée et se fait pénaliser. Le domaine ne peut pas porter ce test, puisqu'il n'accepte aucune entrée de marquage avec laquelle mentir. |
| Infrastructure | Dépôts Prisma contre un vrai Postgres via testcontainers. Figeage du jeu. Cascade de suppression. Unicité du tirage d'une carte. |
| Contrat | `runContractSuite` du noyau sur le manifeste. |
| Passerelle | Intégration sur un vrai serveur socket avec l'adaptateur de la plateforme : refus sans jeton, refus d'un jeton invité émis pour un autre module, message hors matrice refusé. |
| Bout en bout | Parcours complet : Elda crée et ouvre, un invité entre par QR, elle tire, il réclame, il gagne. Ce test solde le point laissé en réserve à la fermeture de la dette du sous-projet 1. |

## 13. Risques et décisions différées

| Sujet | Décision | Déclencheur de réexamen |
|---|---|---|
| Images en base | Acceptées pour un locataire et des volumes de quelques mégaoctets | Deuxième module ayant besoin d'images, ou multiplication des jeux illustrés |
| Absence de Redis | État en Postgres, instance unique | Deuxième instance de l'API |
| Tirage manuel seul | Suffisant en classe | Demande d'un usage hors classe, en autonomie |
| Une seule figure par partie | Suffisant | Demande d'enchaîner línea puis llena dans la même partie |
| Wifi d'établissement | Reprise d'état complète à la reconnexion | Constat de terrain lors de la première séance |
| Effectifs au-delà de trente-cinq | Non mesuré | Première séance en classe entière |

## 14. Références

- Spec du noyau : `docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md`
- Contrat de module : `docs/module-contract.md`
- Conventions : `CLAUDE.md`, en particulier la frontière noyau et module, la convention de base et la sécurité WebSocket
