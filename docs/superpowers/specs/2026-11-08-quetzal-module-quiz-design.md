# Quetzal — Sous-projet 3 : module Quiz

> Spec de conception. Écrite le 08/11/2026, après un panel d'experts (voir § 10).
> Le cycle de ce dépôt est spec → plan → code (`CLAUDE.md` §15) : ce document ne
> contient aucun code et n'engage aucune date.

## 1. Objectif

Livrer le deuxième vrai module métier de Quetzal : un quiz jouable en classe, où
l'enseignante compose sa banque de questions et anime la session depuis son écran
pendant que les élèves répondent sur leur téléphone.

Le module doit prouver que le contrat posé au sous-projet 1 tient pour un
**second** module réel — c'est-à-dire que la frontière noyau / module n'a pas été
taillée pour le seul loto. Deux capacités sont attendues à ce titre : le **port**
des images remonte dans le noyau (issue #28, dont le déclencheur est précisément
« le jour où un deuxième module a besoin d'images » — voir D11, qui scinde cette
issue en deux), et le contrat gagne un état temporel que le loto avait refusé.

## 2. Public et scénario de référence

**Utilisatrice** : Elda, professeure d'espagnol, seule utilisatrice du MVP.

**Séance type.** Elda a préparé une banque de questions en amont. En classe, elle
crée une session, choisit le **mode** (défi ou contrôle) et l'**unité** (solo ou
équipes), projette son écran, les élèves scannent le QR et rejoignent. Elle ouvre
la première question. En défi, un délai la ferme et le classement s'affiche ; en
contrôle, elle laisse le temps qu'elle juge bon et passe à la suivante quand elle
veut. À la fin, un podium en défi, un tableau question par question en contrôle.

**Contexte matériel** : identique au loto, et c'est une donnée de conception, pas
un décor. Salle de classe, **wifi d'établissement peu fiable**, entre quinze et
trente-cinq élèves, un vidéoprojecteur, **un nombre de téléphones variable**.

**Mesures de charge disponibles** (issue #32, `scripts/mesurer-la-charge.mjs`) :
quarante invités qui rejoignent en même temps entrent en 1608 ms de médiane, et
un événement leur est diffusé en 89 ms ; à soixante, 2129 ms et 215 ms. L'API
tourne sur Render en plan gratuit : l'instance s'éteint au repos et le premier
appel peut mettre soixante secondes.

## 3. Périmètre

### 3.1 Dans le périmètre

| Domaine | Contenu |
|---|---|
| Banque de questions | Création de zéro, duplication, édition, suppression. Questions ordonnées. |
| Modes de réponse | **choix** (propositions portant texte et/ou image) et **saisie** (l'élève écrit) |
| Images | Port remonté dans le noyau (D11), sur les propositions comme sur l'énoncé. L'adaptateur reste celui en base. |
| Session | Création avec mode et unité, code court et QR, salle d'attente, ouverture et fermeture de question, historique |
| Participants | Solo ou équipes par un seul réglage, répartition automatique au-delà du maximum |
| Scoring | Juste / faux en contrôle ; juste / faux **plus un bonus de vitesse borné** en défi |
| Retour de séance | Podium en défi, tableau question × participant en contrôle |
| Robustesse | Reprise complète de l'état à la reconnexion, et après redémarrage de l'API |

### 3.2 Hors périmètre, assumé

**Rejouer seul, en asynchrone.** Sorti de ce sous-projet sur l'argument du
dissident : son contour n'est pas défini — on ignore s'il consomme la banque
figée d'une session passée ou la banque vivante, qui le lance, depuis quel écran,
avec quel compte élève. Régler finement un produit dont on ne connaît pas
l'agrégat est prématuré. ⚠️ La contrainte d'accessibilité qui l'exigeait (un
canal non chronométré vers le même contenu, § 8) reste tenue par le **mode
contrôle**, qui n'a aucun minuteur.

**Répétition espacée et planification.** Territoire du sous-projet 4, dont la
spec du noyau exige un panel d'experts sur SM-2 contre FSRS avant toute ligne.

**La bascule des images vers un stockage objet servi par CDN.** Seconde moitié de
#28, et rien dans ce module ne l'impose : l'adaptateur en base sert déjà le loto
en production. Voir D11. Le déclencheur de cette moitié-là reste à venir — un
volume ou un coût qui la justifie, pas un second module.

Également dehors : plusieurs réponses justes pour une même question · import ou
export de banques · partage entre locataires · son et musique · chat ·
illustration générée par IA · classement cumulé entre séances · questions à
ordonner ou à curseur · modification d'un délai **pendant** une séance ·
minuterie globale de session visible aux élèves.

### 3.3 Contraintes issues du jeu

- Une question en mode **choix** porte au moins deux propositions, et **exactement une** juste (§ 3.2).
- Une question en mode **saisie** porte au moins une réponse acceptée.
- Une banque jouable contient au moins une question.
- Le délai n'existe qu'en mode défi (D6), et il est borné : trois secondes au minimum, cent vingt au maximum.

## 4. Décisions de conception

### D1 — Deux modes de réponse, pas quatre types de questions

Une proposition est `{ texte?, imageId? }`, au moins l'un des deux. QCM,
vrai/faux et appariement mot ↔ image sont alors des **configurations** du mode
`choix` : une seule règle de validation, un seul écran élève, un seul éditeur.

Le mode `saisie` est le second, et le seul où « juste » n'est pas un choix mais
un jugement : `está` contre `esta`, majuscules, fautes de frappe, et
`coche`/`carro`/`auto` qui sont tous bons. D'où D2.

**Conséquence** : ajouter « appariement » ne demande aucun code. C'est un cas du
même modèle, décidé à la rédaction.

### D2 — La saisie est jugée par une normalisation explicite, réglée par question

Une question en `saisie` porte une liste de réponses acceptées et deux drapeaux :
sensibilité aux accents, sensibilité à la casse. La comparaison applique la
normalisation choisie, puis l'égalité stricte.

⛔ **Aucune distance d'édition, aucune tolérance aux fautes de frappe.** Un seuil
de similarité est un réglage que personne ne sait calibrer et qui transforme une
règle en opinion : `esta`/`está` est une faute d'accent qu'Elda veut peut-être
pardonner, `casa`/`cosa` est un mot différent, et une distance de un les traite
pareil. Le pardon est donc explicite — Elda ajoute la variante dans les réponses
acceptées — jamais statistique.

### D3 — Mode et unité sont deux réglages orthogonaux

Le **mode** (`defi` / `controle`) décide du scoring et de ce que l'écran montre.
L'**unité** (solo / équipes) décide de qui répond. Les quatre combinaisons sont
valides et aucune n'est un cas particulier.

### D4 — Le domaine ne connaît que des participants, et l'unité est un nombre

Reprise directe de **D3 du loto** : « le domaine ne connaît que des équipes, un
joueur seul est une équipe d'un ». Solo est un plafond de participants assez haut
pour que chacun soit seul ; équipes est un plafond bas, et le serveur répartit
les arrivants au-delà.

**Conséquence** : il n'y a pas deux modèles de données, et l'usage « un seul
téléphone pour deux élèves » ne demande aucun code — ce qui compte, puisque le
nombre de téléphones est variable (§ 2).

**Conséquence sur le retour de séance** : en unité équipes, le retour dit ce qu'a
fait l'**équipe**, pas l'élève. Chaque réponse conserve néanmoins l'identifiant
de l'invité qui a appuyé, ce qui laisse la porte ouverte sans rien promettre à
l'écran.

### D5 — Le serveur mesure le temps, le client n'en rapporte jamais

Le bonus de vitesse se calcule sur l'écart entre l'ouverture de la question et
l'**arrivée** de la réponse, mesuré côté serveur. Même esprit que **D1 du loto**,
« le serveur ne fait jamais confiance au marquage du client » : un client ne peut
pas s'inventer rapide, et la dérive d'horloge entre appareils ne touche pas le
score.

⚠️ **Ce que cette décision ne règle PAS, et c'est la trouvaille du panel.** Elle
traite la triche et la dérive d'horloge, pas le **délai de livraison**. Deux
sièges indépendants l'ont relevé, et le dissident en a fait sa cartouche : si
l'écart est mesuré depuis l'ouverture côté serveur, un élève dont le wifi retarde
la réception perd du temps sans aucune faute — sur un réseau mesuré à 1,6 s
d'entrée médiane à quarante téléphones. D'où D7.

### D6 — Le minuteur n'existe qu'en mode défi

En mode **contrôle**, aucune limite de temps : Elda ouvre une question, laisse le
temps qu'elle juge bon, et passe à la suivante. C'est le levier manuel de **D4 du
loto** — « un intervalle automatique lui retirerait précisément ce contrôle » —
restitué là où il a du sens.

Cette décision résout un problème d'accessibilité au lieu de le traiter. Le
critère WCAG 2.2.1 / RGAA 13.1 porte sur « chaque limite de temps définie par le
contenu » : là où il n'y en a aucune, il ne s'applique pas, et l'interface n'a
donc **aucun** mécanisme « turn off / adjust / extend » à construire. En mode
défi, les deux exceptions de la norme jouent (§ 8).

### D7 — La vitesse est un bonus borné, jamais le terme dominant

En défi, une réponse juste rapporte une base fixe, plus un bonus proportionnel au
temps restant et **plafonné à un quart de la base**.

Trois propriétés tenues par ce plafond, et ce sont elles qui justifient le
chiffre :

1. une réponse juste bat **toujours** une réponse fausse, quel que soit le réseau ;
2. le bruit réseau ne peut pas renverser un classement établi sur la justesse —
   il n'en déplace que les égalités ;
3. la tension du jeu subsiste : répondre tôt rapporte visiblement plus.

C'est la réponse retenue au défaut nommé en D5. Les deux autres options du panel
sont consignées en § 10.

### D8 — Une question se ferme par une échéance persistée, évaluée paresseusement

À l'ouverture d'une question, le serveur écrit `openedAt` et, en défi,
`deadlineAt`. **Aucun minuteur en mémoire, aucun ordonnanceur.** La fermeture est
calculée à la lecture : à l'arrivée d'une réponse, à la demande d'un instantané,
à la commande « question suivante ».

Raison : un `setTimeout` meurt avec le processus, et l'API tourne sur un plan
gratuit qui s'éteint au repos et redéploie. Un échéancier en mémoire y est un
défaut garanti, pas un risque. Une échéance en base ne laisse rien à reprendre :
toute lecture la réévalue.

**Le compromis, nommé plutôt que découvert en classe** : sans acteur actif, rien
ne fait basculer l'écran à l'instant exact de l'échéance. Le décompte visuel vit
donc dans le navigateur de l'**animatrice** — un seul appareil, déjà dans le flux
« commandes en HTTP » de D9 — et c'est lui qui appelle la fermeture à zéro.

### D9 — Les commandes en HTTP, la diffusion en WebSocket

Reprise de **D7 du loto**, sans changement.

### D10 — Le délai se règle par question, et la session fige sa banque

**Le délai se règle question par question**, avec le défaut de session comme
valeur héritée et une action « appliquer à toutes » pour ne pas forcer vingt
réglages à la rédaction. C'est la décision que le panel a renversée à
l'unanimité, pour trois raisons indépendantes : une question de vocabulaire et
une question de compréhension ne demandent pas le même temps ; le mode `saisie`
demande mécaniquement plus de temps que le mode `choix` (D1), donc un délai
unique serait trop court pour l'un ou trop long pour l'autre ; et le grain
attendu par WCAG 2.2.1 est « *chaque* limite de temps », pas la session (§ 8).

Le reste de cette décision reprend **D5 du loto**, qui fige son jeu de cartes.
Sans cela, corriger une question en pleine séance changerait le sens des réponses
déjà données.

⛔ **Le délai vit sur la question FIGÉE, pas sur la session**, et c'est la
décision la plus irréversible de ce document. Le dissident l'a désignée : si le
délai est une colonne de session, en ajouter un par question plus tard n'est pas
un réglage mais une migration touchant toutes les sessions historisées — la même
jurisprudence que D5 du loto. La résolution « délai de la question, sinon défaut
de la session » se fait **au figement**, une fois, et la valeur résolue est
écrite sur la ligne figée.

### D11 — L'issue #28 se scinde en deux, et une seule moitié entre ici

#28 énonce deux choses d'un seul souffle : « la capacité remonte au niveau de la
plateforme **et** bascule sur un stockage objet servi par CDN ». Elles sont
séparables, et une seule est imposée par ce module.

**Ce qui est imposé.** Le port vit aujourd'hui dans
`packages/module-loto/src/domain/ports/card-image.store.ts`, donc **chez un
module**. `CLAUDE.md` §3 et §14 interdisent à un module d'importer un autre
module. Le quiz ne peut donc pas réutiliser ce port là où il est : il faut le
remonter, lui et son adaptateur Prisma, dans `@quetzal/core`. C'est la « remontée
au niveau de la plateforme » de #28, et elle est inévitable ici.

**Ce qui ne l'est pas.** Le stockage objet et le CDN. L'adaptateur en base sert
déjà le loto en production, et la remontée du port ne le touche pas. Confondre
les deux ferait entrer une migration d'infrastructure dans un sous-projet de
module, sans qu'aucun besoin mesuré ne la demande — exactement le reproche que
#28 se fait à elle-même en attendant son déclencheur.

⚠️ Conséquence à ne pas sous-estimer : la remontée touche du code **en
production**. Le garde qui existe déjà, `port-images-non-contourne.spec.ts`,
devra suivre le port dans le noyau, sinon il garderait un chemin que plus
personne n'emprunte et passerait au vert par vacuité — le défaut qu'il
s'interdit lui-même dans son second test.

### D12 — Le retour de séance vit dans le module, sans port

Pas de capacité de plateforme, et pas de port en attendant.

Raison, et elle vient d'une correction de l'humain : **le retour du loto n'a pas
la même forme.** Le quiz produit un tableau question × participant → juste, faux,
temps. Le loto n'a pas de bonne réponse par élève — son retour serait quelles
cartes sont sorties, qui a réclamé à tort, qui a gagné. Fabriquer une abstraction
au-dessus de deux choses qui ne se ressemblent pas est exactement ce que #28
évite en attendant un vrai second consommateur ; ici il n'y en a aucun.

Le port de D6 du loto existait parce qu'on savait que le **support** changerait.
Ici, on ne saurait pas dire ce qu'on mettrait derrière.

## 5. Modèle de domaine

### 5.1 Question

Une question appartient à une banque, porte un rang, un énoncé, une image
facultative, et l'un des deux modes de réponse de D1.

En `choix` : deux à quatre propositions, exactement une juste.
En `saisie` : au moins une réponse acceptée, et les deux drapeaux de D2.

Elle porte un délai facultatif (`null` = hériter du défaut de session), borné par
§ 3.3, et sans effet en mode contrôle (D6).

### 5.2 Validation d'une réponse

La seule règle qui décide juste ou faux, et elle est pure :

- `choix` : l'identifiant de proposition reçu est celui de la proposition juste.
- `saisie` : la valeur reçue, normalisée selon les drapeaux de la question, figure
  dans les réponses acceptées également normalisées.

⛔ Le serveur ne tient aucun compte de ce que le client affirme sur sa propre
justesse ni sur son propre temps (D5).

### 5.3 Score

`controle` : juste vaut un point, faux zéro. Aucun temps n'entre dans le calcul.
`elapsedMs` y est tout de même enregistré, mais à titre indicatif pour le retour
de séance — il ne pèse sur aucun score.

`defi` : faux vaut zéro ; juste vaut `BASE + bonus`, où

```
reste = max(0, (deadlineAt − arrivee) / (deadlineAt − openedAt))
bonus = round(BONUS_MAX × reste)        avec BONUS_MAX = BASE / 4
```

La valeur absolue de `BASE` est sans importance et sera fixée au plan : seul
compte le **rapport** `BONUS_MAX / BASE`, qui porte les trois propriétés de D7.

Une réponse acceptée dans la **marge de grâce** vaut `BASE` sans bonus : la grâce
ne doit jamais devenir un avantage. Sa durée est fixée au plan, et bornée par une
contrainte : elle doit rester petite devant le délai le plus court autorisé —
trois secondes (§ 3.3) — faute de quoi elle cesserait d'être une marge pour
devenir une rallonge.

### 5.4 État d'une session

`brouillon → ouverte → en cours → terminée`. Une question est `ouverte` ou
`fermée` ; une session en cours a au plus une question ouverte.

On rejoint quand la session est `ouverte` — comme on entre en classe avant le
cours, D5 du loto. Une reconnexion aboutit toujours, même session commencée :
sinon une coupure wifi exclut un élève.

### 5.5 Unité de jeu

Un seul nombre, `maxParticipants` (D4). L'interface le présente comme un choix
entre solo et équipes ; le domaine ne connaît que le nombre.

## 6. Modèle de données

Préfixe `Quiz_` obligatoire (`CLAUDE.md` §7), `tenantId` sur toute table, clé
composite `@@id([id, tenantId])`, identifiants UUID v7 par `newId()`, pas d'enum
Postgres mais `String` + CHECK + Zod (§9).

| Table | Rôle | Points à ne pas laisser au hasard |
|---|---|---|
| `Quiz_Deck` | banque de questions | même forme que `Loto_Deck`, `isTemplate` compris |
| `Quiz_Question` | question vivante, éditable | `answerMode` CHECK `('choix','saisie')` · `timeLimit` nullable · `@@unique([deckId, rank, tenantId])` |
| `Quiz_Option` | proposition d'une question `choix` | `isCorrect` · `imageId` nullable · CHECK « au moins texte ou image » hors de SQL, porté par Zod et le domaine |
| `Quiz_AcceptedAnswer` | réponse acceptée d'une question `saisie` | une ligne par variante — le pardon est explicite (D2) |
| `Quiz_Session` | la séance | `mode` CHECK `('defi','controle')` · `maxParticipants` · `joinCode` · `status` CHECK · `defaultTimeLimit` — ⚠️ valeur de **rédaction** uniquement, jamais lue en séance : elle ne contredit pas D10, qui interdit que le délai FAISANT FOI vive ici |
| `Quiz_SessionQuestion` | **la question figée** | ⛔ porte `timeLimitResolved`, `openedAt`, `deadlineAt`, `closedAt`. C'est la seule source du délai **qui fait foi en séance** (D10) ; `Quiz_Question.timeLimit` n'est que la valeur de rédaction, lue une fois au figement. |
| `Quiz_Participant` | équipe ou élève seul | `participantIndex` · `@@unique([sessionId, participantIndex, tenantId])`, comme `Loto_Team` |
| `Quiz_Member` | l'invité derrière un participant | permet de garder l'auteur d'une réponse (D4) |
| `Quiz_Answer` | une réponse | `@@unique([sessionQuestionId, participantId, tenantId])` — on répond une fois · `authorGuestId` · `isCorrect` · `elapsedMs` · `points` |

⚠️ `Quiz_Answer.points` est **calculé au moment de la réponse et stocké**. Ce
n'est pas de la dénormalisation paresseuse : recalculer un score après coup
demanderait que la formule et les délais d'alors soient encore vrais, et D10 fige
précisément parce qu'ils ne le resteront pas.

## 7. Contrat du module

**Manifeste** : `permissions` déclare chaque route — le test de contrat du module
échoue sinon, comme il l'a fait pour le renommage d'équipe du loto. Les routes
d'autorat et les commandes de session sont `owner` / `creator` ; répondre est un
message WS `guest` / `learner`.

⚠️ `maxConcurrentPerSession` est aujourd'hui un champ **décoratif** dans tout le
dépôt (issue #75 : déclaré, validé par Zod, lu par personne — soixante invités
entrent là où le manifeste en annonce quarante). Ce module ne doit pas s'appuyer
dessus en le croyant appliqué.

**Événements** : une table `QuizEventPayloads` par module, dans le contrat public
du module, avec un assistant `emitQuiz` typé — le motif établi par l'issue #53,
qui lie le nom d'un événement à la forme de sa charge et fait rougir le
compilateur sur un champ manquant. Événements prévus :
`quiz.session.started`, `quiz.question.opened`, `quiz.answer.recorded`,
`quiz.question.closed`, `quiz.session.finished`.

**Catalogues** : `fr`, `en`, `es`, parité obligatoire. Aucune chaîne brute dans
le JSX — la règle `react/jsx-no-literals` du dépôt la refuse, y compris pour un
pictogramme.

## 8. Accessibilité — le plancher non négociable

Avis sourcé du siège accessibilité du panel. Ce ne sont pas des arbitrages.

**Le cadre.** WCAG **2.2.1** « Timing Adjustable » (niveau A) exige, pour chaque
limite de temps définie par le contenu, l'un de trois mécanismes : la désactiver
avant de la rencontrer, l'ajuster sur une plage d'au moins dix fois le défaut, ou
être averti et pouvoir la prolonger au moins dix fois. Transposé par le RGAA en
critère **13.1** : « Pour chaque page web, l'utilisateur a-t-il le contrôle de
chaque limite de temps modifiant le contenu (cas particuliers exceptés) ? »
Sources : [W3C WAI, Understanding
2.2.1](https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable) et le
[référentiel RGAA](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/).

**Pourquoi le mode défi est conciliable.** Les deux exceptions de la norme jouent
cumulativement : *real-time*, « the time limit is a required part of a real-time
event […] and no alternative to the time limit is possible » — trente-cinq
téléphones répondant à une même question projetée sont un événement synchrone de
groupe, au sens où l'exemple-type de la norme, l'enchère, l'entend ; et
*essential*, « extending it would invalidate the activity » — sans vitesse, le
défi n'est plus un défi, c'est le mode contrôle, qui existe séparément.

**Et pourquoi le mode contrôle n'a pas besoin d'exception** : D6 lui retire toute
limite de temps, donc le critère ne s'y applique pas.

⛔ **La condition qui tient tout.** L'exception protège la conformité d'un
critère, pas le droit d'accès à la leçon : **le mode défi ne doit jamais être le
seul canal vers un contenu.** Toute banque jouable en défi doit être jouable en
contrôle, sans pression de vitesse.

Le reste du plancher, par criticité :

1. **Marge de grâce** (§ 5.3) : une sélection ou une frappe déjà engagée au moment de la
   fermeture se valide dans une courte marge — sinon la pénalité temporelle
   s'ajoute à une pénalité motrice pour qui vise lentement. Sans bonus (§ 5.3).
2. **Minuteur annoncé, pas seulement affiché** : un décompte uniquement visuel est
   invisible à un lecteur d'écran. Annonce programmatique à des jalons, par
   `role="status"`, **sans voler le focus** — cohérent avec le bannissement
   d'`autoFocus` déjà en vigueur dans ce dépôt.
3. **Cibles tactiles larges et espacées** en mode `choix` : viser mal plus un délai
   serré est une double pénalité qui annulerait tout le reste.
4. **Minuteur et boutons survivent au zoom texte** : la présentation en CSS et
   jamais en HTML est déjà une règle de ce dépôt (RGAA thématique 10).
5. **Délai par question** (D10) : c'est le seul levier qui neutralise, item par
   item, l'effet de la longueur de lecture sur un élève dyslexique — sans
   ralentir pour tous les items qui n'en ont pas besoin.

## 9. Tests

TDD strict, Red / Green / Refactor, commits `test:` avant `feat:` (`CLAUDE.md`
§5). Ce qui relève du domaine et doit arriver en rouge d'abord :

- la validation d'une réponse, pour les deux modes ;
- la normalisation de la saisie, drapeau par drapeau, avec les cas `está`/`esta` et `casa`/`cosa` ;
- le calcul du score, et **les trois propriétés de D7 comme tests** : juste bat toujours faux, le bonus est plafonné, la grâce ne rapporte aucun bonus ;
- la résolution du délai au figement : question, sinon défaut de session, sinon refus ;
- la fermeture paresseuse : une réponse arrivée après l'échéance est refusée, une réponse dans la grâce est acceptée sans bonus.

Intégration contre un vrai Postgres pour le figement, l'unicité d'une réponse par
participant et par question, et le cloisonnement par locataire. E2E pour une
séance complète dans chacun des deux modes.

⚠️ Deux pièges de mesure connus, à ne pas redécouvrir : la limite de cent jetons
d'invité par heure sur `/api/guest-token`, et l'invalidité d'une mesure de
stabilité e2e par exécutions répétées contre un serveur de longue vie (issue #68).

## 10. Ce que le panel a tranché, et la dissidence conservée

Panel du 08/11/2026 : trois sièges — usage pédagogique, temps réel et
architecture, accessibilité — plus un **dissident mandaté**, dont le devoir était
de construire le dossier contre le consensus. Les experts n'ont pas vu les
raisonnements des autres avant la synthèse.

**Renversé.** Le délai par question, que j'avais classé hors périmètre, l'est à
l'unanimité. Mon argument — la continuité avec D4 du loto — était **faux** : D4
retirait un minuteur automatique *pour garder un levier manuel*, et le quiz
n'avait pas ce levier. D6 le lui rend.

**Confirmé, pour d'autres raisons que les miennes.** Sortir la vitesse du solo
était juste de conclusion mais mal motivé : « seul, ça ne mesurerait que la
connexion » se retourne contre la classe, où la congestion est pire. Le motif
valable est normatif — en solo les deux exceptions de 2.2.1 s'effondrent. Et le
dissident a eu le dernier mot en montrant que ce produit n'a pas de contour :
« rejouer seul » sort du sous-projet (§ 3.2).

**Dissidence conservée au dossier, bien qu'écartée.** Le dissident soutient que le
vrai défaut est d'avoir accepté le score à la vitesse : « le score ne récompensera
pas l'élève le plus rapide en espagnol, mais celui qui est assis le plus près du
routeur ». Deux autres options avaient été posées et n'ont pas été retenues : un
`t0` par participant à l'accusé d'affichage, écarté comme trichable sans
plafonnement ; et le renoncement pur au dégressif. D7 est la réponse retenue —
borner le bonus pour que le réseau ne déplace que les égalités — et elle **réduit**
le biais sans le supprimer.

Le dissident a également relevé un effet irréversible qui n'est pas technique :
le classement est **vu en direct, projeté devant la classe**. Changer la formule
plus tard ne défait pas ce qui s'est joué dans la salle. Aucune décision de ce
document ne le traite ; il est consigné pour qu'une première séance réelle le
regarde.

**À mesurer en séance, pas à décider ici.** Si les classements des premières
questions d'une session sont corrélés à l'ordre de connexion, le biais de latence
domine malgré D7, et D7 devra être rouverte. C'est le signal nommé par le siège
temps réel, et il est observable.
