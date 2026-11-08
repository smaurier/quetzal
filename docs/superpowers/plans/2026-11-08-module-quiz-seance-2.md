# Module Quiz — plan 2, suite : la séance (tâches 4 à 20)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Suite directe de** [`2026-11-08-module-quiz-seance.md`](./2026-11-08-module-quiz-seance.md), dont les tâches 1 à 3 sont un prérequis : le contrat d'événements typé, le barème (`BASE`, `BONUS_MAX`, `GRACE_MS`) et la résolution du délai. Les garde-fous du premier fichier (base locale, vérification par paquet, code de sortie explicite) **restent en vigueur** et ne sont pas répétés ici.

---

## Task 4 : la fermeture paresseuse, et la marge de grâce

**Files:**
- Create: `packages/module-quiz/src/domain/deadline.ts`
- Test: `packages/module-quiz/src/domain/deadline.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/deadline.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { GRACE_MS } from './scoring.js';
import { accueilDeLaReponse } from './deadline.js';

/**
 * D8 : une question se ferme par une ECHEANCE PERSISTEE, evaluee
 * paresseusement. Il n'y a aucun minuteur serveur, aucun `setTimeout` : la
 * question est fermee parce que l'horloge a depasse `deadlineAt`, pas parce
 * qu'un processus s'est reveille.
 *
 * ⛔ C'est ce qui rend la fermeture juste apres une mise en veille de l'instance
 * Render : au reveil, l'echeance est deja dans le passe et la question est
 * fermee, sans qu'aucun reveil rate n'ait laisse une question ouverte pour
 * toujours.
 */
describe('accueilDeLaReponse, mode defi', () => {
  const fenetre = { deadlineAt: 20_000, closedAt: null };

  it('accepte une reponse arrivee bien avant l echeance', () => {
    expect(accueilDeLaReponse(fenetre, 5_000)).toEqual({ kind: 'a-temps' });
  });

  it('accepte une reponse arrivee pile a l echeance', () => {
    expect(accueilDeLaReponse(fenetre, 20_000)).toEqual({ kind: 'a-temps' });
  });

  /**
   * ⛔ Spec §8 point 1 : une selection ou une frappe DEJA ENGAGEE au moment de
   * la fermeture se valide dans une courte marge. Sans elle, la penalite
   * temporelle s'ajoute a une penalite motrice pour qui vise lentement.
   */
  it('accepte dans la grace, et le dit, pour que le bareme n accorde aucun bonus', () => {
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS - 1)).toEqual({ kind: 'dans-la-grace' });
  });

  it('accepte au dernier instant de la grace', () => {
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS)).toEqual({ kind: 'dans-la-grace' });
  });

  /**
   * ⛔ LA BORNE. Un `<=` de trop ici etendrait la grace d'une milliseconde, ce
   * qui est anodin ; mais un `<` manquant la rendrait INFINIE, et la question
   * ne se fermerait jamais.
   */
  it('refuse juste apres la fin de la grace', () => {
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS + 1)).toEqual({
      kind: 'trop-tard',
      raison: 'echeance-depassee',
    });
  });

  it('refuse tres au-dela', () => {
    expect(accueilDeLaReponse(fenetre, 900_000)).toEqual({
      kind: 'trop-tard',
      raison: 'echeance-depassee',
    });
  });

  /**
   * ⛔ Une question FERMEE A LA MAIN par l'animatrice refuse, meme si son
   * echeance n'est pas atteinte. Sinon son geste « on passe a la suite »
   * n'aurait aucun effet, et des reponses continueraient d'arriver sur une
   * question que la classe a quittee.
   */
  it('refuse quand l animatrice a ferme la question avant son echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 9_000)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });

  it('refuse meme une reponse anterieure a la fermeture manuelle', () => {
    // L'horodatage d'arrivee est mesure a la reception, donc une reponse
    // « anterieure » signale une horloge qui recule ou un rejeu. On refuse.
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 7_000)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });
});

describe('accueilDeLaReponse, mode controle', () => {
  /**
   * D6 : aucun minuteur, donc `deadlineAt` est null et rien n'expire. La seule
   * fin possible est le geste de l'animatrice.
   */
  it('accepte toujours quand il n y a aucune echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: null, closedAt: null }, 9_000_000)).toEqual({
      kind: 'a-temps',
    });
  });

  it('refuse apres la fermeture manuelle, meme sans echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: null, closedAt: 1_000 }, 1_200)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });

  /**
   * ⛔ La grace ne doit PAS s'appliquer en mode controle : il n'y a rien dont
   * elle serait la marge. L'accorder ferait croire a un bonus absent, et
   * surtout rendrait `dans-la-grace` la ou le bareme attend `a-temps`.
   */
  it('ne rend jamais dans-la-grace quand il n y a aucune echeance', () => {
    const accueil = accueilDeLaReponse({ deadlineAt: null, closedAt: null }, 50_000);
    expect(accueil.kind).not.toBe('dans-la-grace');
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/deadline.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './deadline.js'`.

- [ ] **Step 3 : écrire la règle**

`packages/module-quiz/src/domain/deadline.ts` :

```ts
import { GRACE_MS } from './scoring.js';

export interface FenetreOuverte {
  /** `null` en mode contrôle : rien n'expire (D6). */
  readonly deadlineAt: number | null;
  /** Non nul dès que l'animatrice a fermé la question à la main. */
  readonly closedAt: number | null;
}

export type AccueilDeReponse =
  | { kind: 'a-temps' }
  | { kind: 'dans-la-grace' }
  | { kind: 'trop-tard'; raison: 'echeance-depassee' | 'question-fermee' };

/**
 * Cette réponse est-elle recevable ? D8 : évaluation **paresseuse**, sans aucun
 * minuteur serveur et sans `setTimeout`.
 *
 * ⛔ C'est ce qui rend la fermeture juste même après une mise en veille de
 * l'instance Render : au réveil, l'échéance est déjà dans le passé et la
 * question est fermée. Un réveil programmé, lui, aurait pu être manqué et
 * laisser une question ouverte pour toujours.
 */
export function accueilDeLaReponse(
  fenetre: FenetreOuverte,
  arriveeMs: number,
): AccueilDeReponse {
  // Le geste de l'animatrice passe AVANT l'échéance : sans ça, « on passe à la
  // suite » n'aurait aucun effet tant que le délai n'est pas écoulé.
  if (fenetre.closedAt !== null) return { kind: 'trop-tard', raison: 'question-fermee' };

  // Mode contrôle : rien n'expire, et surtout pas de grâce — il n'y a rien dont
  // elle serait la marge.
  if (fenetre.deadlineAt === null) return { kind: 'a-temps' };

  if (arriveeMs <= fenetre.deadlineAt) return { kind: 'a-temps' };
  if (arriveeMs <= fenetre.deadlineAt + GRACE_MS) return { kind: 'dans-la-grace' };
  return { kind: 'trop-tard', raison: 'echeance-depassee' };
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/deadline.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 12 tests verts.

- [ ] **Step 5 : prouver les trois gardes par mutation**

```bash
cd packages/module-quiz && cp src/domain/deadline.ts /tmp/dl.bak && cd ../..

echo "### M1 : la grace devient infinie"
sed -i "s|  if (arriveeMs <= fenetre.deadlineAt + GRACE_MS) return { kind: 'dans-la-grace' };|  return { kind: 'dans-la-grace' };|" packages/module-quiz/src/domain/deadline.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/deadline.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -cE "^ FAIL" /tmp/v1.log
cp /tmp/dl.bak packages/module-quiz/src/domain/deadline.ts

echo "### M2 : la fermeture manuelle passe APRES l echeance"
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/domain/deadline.ts';
let t=fs.readFileSync(f,'utf8');
const ligne=t.split('\n').find(l=>l.includes(\"raison: 'question-fermee'\")&&l.includes('if (fenetre.closedAt'));
t=t.replace(ligne+'\n','');
t=t.replace(\"  if (fenetre.deadlineAt === null) return { kind: 'a-temps' };\", ligne+'\n  if (fenetre.deadlineAt === null) return { kind: \\'a-temps\\' };');
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/deadline.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
cp /tmp/dl.bak packages/module-quiz/src/domain/deadline.ts

echo "### M3 : la grace s applique aussi en mode controle"
sed -i "s|  if (fenetre.deadlineAt === null) return { kind: 'a-temps' };|  if (fenetre.deadlineAt === null) return { kind: 'dans-la-grace' };|" packages/module-quiz/src/domain/deadline.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/deadline.spec.ts > /tmp/v3.log 2>&1; echo "CODE : $?"
grep -E "jamais dans-la-grace|accepte toujours" /tmp/v3.log | head -2
cp /tmp/dl.bak packages/module-quiz/src/domain/deadline.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/deadline.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: M1, M2 et M3 chacune **CODE : 1**, puis **CODE : 0** et 12 verts.

⚠️ M2 est écrite en Node et non en `sed` parce qu'elle **déplace** une ligne au
lieu de la remplacer. Si le script n'affiche pas « mutation posee », la ligne
cherchée a changé de forme : la déplacer à la main, l'important est de prouver
que l'ordre des deux gardes compte.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/domain/deadline.spec.ts
git commit -m "test(quiz): exiger une fermeture paresseuse et une marge de grace

D8 et spec §8 point 1. Vu rouge d abord.

Quatre tests portent des pieges qui ne se voient pas a la lecture :

- la BORNE de la grace. Un <= de trop l etend d une milliseconde, ce qui
  est anodin ; un < manquant la rend INFINIE et la question ne se ferme
  jamais.
- la fermeture MANUELLE passe avant l echeance. Sinon le geste « on passe
  a la suite » n a aucun effet tant que le delai n est pas ecoule, et des
  reponses continuent d arriver sur une question que la classe a quittee.
- la grace ne s applique PAS en mode controle : il n y a rien dont elle
  serait la marge, et la rendre la ferait croire a un bonus absent.
- une reponse anterieure a la fermeture manuelle est refusee aussi :
  l horodatage est mesure a la reception, donc une arrivee anterieure
  signale une horloge qui recule ou un rejeu."
git add packages/module-quiz/src/domain/deadline.ts
git commit -m "feat(quiz): decider si une reponse est recevable, sans aucun minuteur

D8 : evaluation paresseuse, zero setTimeout serveur.

⛔ C est ce qui rend la fermeture juste APRES une mise en veille de l
instance Render : au reveil l echeance est deja dans le passe et la
question est fermee. Un reveil programme aurait pu etre manque et laisser
une question ouverte pour toujours.

Verifie par mutation : grace infinie, ordre des deux gardes inverse, et
grace appliquee en mode controle font chacune rougir."
```

---

## Task 5 : la machine d'états d'une séance

**Files:**
- Create: `packages/module-quiz/src/domain/session-status.ts`
- Create: `packages/module-quiz/src/domain/errors.ts` (modifier celui du plan 1)
- Test: `packages/module-quiz/src/domain/session-status.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/session-status.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { SESSION_STATUSES, isSessionStatus, peutPasserA, peutRejoindre } from './session-status.js';

/**
 * Spec § 5.4 : `brouillon -> ouverte -> en-cours -> terminee`.
 */
describe('isSessionStatus', () => {
  it('reconnait les quatre etats de la spec, et rien d autre', () => {
    expect([...SESSION_STATUSES]).toEqual(['brouillon', 'ouverte', 'en-cours', 'terminee']);
    expect(isSessionStatus('en-cours')).toBe(true);
    expect(isSessionStatus('pause')).toBe(false);
  });
});

describe('peutPasserA', () => {
  it('autorise la marche normale, etape par etape', () => {
    expect(peutPasserA('brouillon', 'ouverte')).toBe(true);
    expect(peutPasserA('ouverte', 'en-cours')).toBe(true);
    expect(peutPasserA('en-cours', 'terminee')).toBe(true);
  });

  /**
   * ⛔ Terminer depuis `ouverte` est AUTORISE, et ce n'est pas un oubli : une
   * animatrice qui ouvre une seance et change d'avis doit pouvoir la fermer
   * sans jouer une question. Interdire cette transition laisserait des seances
   * ouvertes pour toujours, qu'aucun geste ne pourrait clore.
   */
  it('autorise de terminer une seance ouverte mais jamais commencee', () => {
    expect(peutPasserA('ouverte', 'terminee')).toBe(true);
  });

  /**
   * ⛔ Et depuis `brouillon` aussi : c'est l'equivalent d'une suppression
   * douce, et le meme raisonnement s'applique.
   */
  it('autorise de terminer un brouillon', () => {
    expect(peutPasserA('brouillon', 'terminee')).toBe(true);
  });

  it('interdit de sauter l ouverture', () => {
    expect(peutPasserA('brouillon', 'en-cours')).toBe(false);
  });

  /**
   * ⛔ Un etat TERMINEE est definitif. Le rouvrir ferait repartir une seance
   * dont le retour a peut-etre deja ete lu, et dont les scores sont figes.
   */
  it('interdit toute sortie de terminee', () => {
    for (const cible of SESSION_STATUSES) {
      expect(peutPasserA('terminee', cible)).toBe(false);
    }
  });

  it('interdit de revenir en arriere', () => {
    expect(peutPasserA('en-cours', 'ouverte')).toBe(false);
    expect(peutPasserA('ouverte', 'brouillon')).toBe(false);
  });

  it('interdit de rester au meme etat, pour qu une commande repetee se voie', () => {
    for (const etat of SESSION_STATUSES) {
      expect(peutPasserA(etat, etat)).toBe(false);
    }
  });
});

describe('peutRejoindre', () => {
  /**
   * Spec § 5.4 : on rejoint quand la session est `ouverte`, comme on entre en
   * classe avant le cours (D5 du loto).
   */
  it('laisse entrer sur une seance ouverte', () => {
    expect(peutRejoindre('ouverte')).toBe(true);
  });

  /**
   * ⛔ LA REGLE QUI COMPTE, et elle est dans la spec : « une reconnexion
   * aboutit toujours, meme session commencee : sinon une coupure wifi exclut
   * un eleve. » Le scenario de reference est un wifi d'etablissement peu
   * fiable, donc refuser ici viderait la classe au premier incident.
   */
  it('laisse entrer sur une seance DEJA commencee, sinon une coupure wifi exclut', () => {
    expect(peutRejoindre('en-cours')).toBe(true);
  });

  it('refuse sur un brouillon, qui n a pas encore de code d entree utile', () => {
    expect(peutRejoindre('brouillon')).toBe(false);
  });

  it('refuse sur une seance terminee', () => {
    expect(peutRejoindre('terminee')).toBe(false);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/session-status.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './session-status.js'`.

- [ ] **Step 3 : écrire la machine**

`packages/module-quiz/src/domain/session-status.ts` :

```ts
export const SESSION_STATUSES = ['brouillon', 'ouverte', 'en-cours', 'terminee'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export function isSessionStatus(valeur: string): valeur is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(valeur);
}

/**
 * Les transitions permises, écrites en table plutôt qu'en cascade de `if` : une
 * table se lit d'un coup d'œil, et un état oublié s'y voit.
 *
 * ⛔ `terminee` ne mène nulle part, et c'est délibéré : rouvrir une séance
 * ferait repartir un jeu dont le retour a peut-être déjà été lu et dont les
 * scores sont figés.
 *
 * ⛔ `ouverte -> terminee` et `brouillon -> terminee` sont permis, et ce n'est
 * pas un oubli : une animatrice qui change d'avis doit pouvoir clore sans jouer
 * une question. Les interdire laisserait des séances qu'aucun geste ne ferme.
 */
const TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  brouillon: ['ouverte', 'terminee'],
  ouverte: ['en-cours', 'terminee'],
  'en-cours': ['terminee'],
  terminee: [],
};

export function peutPasserA(depuis: SessionStatus, vers: SessionStatus): boolean {
  return TRANSITIONS[depuis].includes(vers);
}

/**
 * On rejoint une séance `ouverte`, comme on entre en classe avant le cours.
 *
 * ⛔ Et une séance `en-cours` aussi. La spec § 5.4 l'exige mot pour mot : « une
 * reconnexion aboutit toujours, même session commencée : sinon une coupure wifi
 * exclut un élève. » Le scénario de référence est un wifi d'établissement peu
 * fiable ; refuser ici viderait la classe au premier incident.
 */
export function peutRejoindre(statut: SessionStatus): boolean {
  return statut === 'ouverte' || statut === 'en-cours';
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/session-status.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 11 tests verts.

- [ ] **Step 5 : prouver les deux gardes qui comptent**

```bash
cd packages/module-quiz && cp src/domain/session-status.ts /tmp/ss.bak && cd ../..

echo "### M1 : une reconnexion est refusee sur une seance commencee"
sed -i "s|  return statut === 'ouverte' \|\| statut === 'en-cours';|  return statut === 'ouverte';|" packages/module-quiz/src/domain/session-status.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/session-status.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "coupure wifi" /tmp/v1.log | head -2
cp /tmp/ss.bak packages/module-quiz/src/domain/session-status.ts

echo "### M2 : terminee redevient reouvrable"
sed -i "s|  terminee: \[\],|  terminee: ['ouverte'],|" packages/module-quiz/src/domain/session-status.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/session-status.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "sortie de terminee" /tmp/v2.log | head -2
cp /tmp/ss.bak packages/module-quiz/src/domain/session-status.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/session-status.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 **CODE : 1** sur le test de la coupure wifi ; M2 **CODE : 1** sur
« interdit toute sortie de terminee » ; puis **CODE : 0**.

- [ ] **Step 6 : étendre les erreurs du domaine**

Ajouter à `packages/module-quiz/src/domain/errors.ts`, écrit au plan 1 :

```ts
export class SessionNotFoundError extends DomainError {
  constructor(sessionId: string) {
    super(`Séance introuvable : ${sessionId}`);
  }
}

/** La transition demandée, nommée : « invalide » seul n'aide personne. */
export class InvalidSessionTransitionError extends DomainError {
  constructor(depuis: string, vers: string) {
    super(`Transition de séance refusée : ${depuis} vers ${vers}`);
  }
}

export class SessionClosedToJoinError extends DomainError {
  constructor(statut: string) {
    super(`On ne rejoint pas une séance dans l'état ${statut}`);
  }
}

export class SessionFullError extends DomainError {
  constructor(maxParticipants: number) {
    super(`Séance complète : ${maxParticipants} participants`);
  }
}

export class NoQuestionOpenError extends DomainError {
  constructor(sessionId: string) {
    super(`Aucune question ouverte sur la séance ${sessionId}`);
  }
}

export class AnswerTooLateError extends DomainError {
  constructor(raison: string) {
    super(`Réponse refusée : ${raison}`);
  }
}

export class AlreadyAnsweredError extends DomainError {
  constructor(participantId: string) {
    super(`Le participant ${participantId} a déjà répondu à cette question`);
  }
}

export class TimeLimitUnresolvableError extends DomainError {
  constructor(rank: number, raison: string) {
    super(`Délai impossible à résoudre pour la question ${String(rank)} : ${raison}`);
  }
}
```

Et étendre `errors.spec.ts` du plan 1 : ajouter les huit nouvelles classes au
tableau `toutes`. ⚠️ Son quatrième test exige des **noms de classe distincts**,
puisque la passerelle renvoie `err.name` au client ; il échouera si deux erreurs
portent le même nom.

- [ ] **Step 7 : vérifier, puis commit en deux**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, tous les tests de domaine verts.

```bash
git add packages/module-quiz/src/domain/session-status.spec.ts packages/module-quiz/src/domain/errors.spec.ts
git commit -m "test(quiz): exiger la machine d etats d une seance

Spec §5.4. Vu rouge d abord.

Quatre tests portent des decisions qui se defendent mal apres coup :

- une RECONNEXION aboutit sur une seance deja commencee. La spec l exige
  mot pour mot, et la raison est le scenario de reference : un wifi d
  etablissement peu fiable. Refuser viderait la classe au premier
  incident.
- terminee ne mene NULLE PART. Rouvrir une seance ferait repartir un jeu
  dont le retour a peut-etre deja ete lu et dont les scores sont figes.
- terminer depuis ouverte ou depuis brouillon est PERMIS, et ce n est pas
  un oubli : une animatrice qui change d avis doit pouvoir clore sans
  jouer une question, sinon des seances restent qu aucun geste ne ferme.
- rester au meme etat est interdit, pour qu une commande repetee se voie."
git add packages/module-quiz/src/domain/session-status.ts packages/module-quiz/src/domain/errors.ts
git commit -m "feat(quiz): la machine d etats d une seance, et ses erreurs typees

Transitions en TABLE plutot qu en cascade de if : une table se lit d un
coup d oeil, et un etat oublie s y voit.

Verifie par mutation : refuser la reconnexion sur une seance commencee,
ou rendre terminee reouvrable, font rougir."
```

---

## Task 6 : les cinq tables de la séance

**Files:**
- Modify: `packages/module-quiz/prisma/models.prisma`
- Create: la migration sous `packages/db/prisma/migrations/`

- [ ] **Step 1 : ajouter les cinq modèles**

Ajouter à la fin de `packages/module-quiz/prisma/models.prisma`, et compléter
`Quiz_Deck` et `Quiz_Question` avec leurs relations inverses :

```prisma
/// Une séance. Même forme que Loto_Game pour ce qui se ressemble.
model Quiz_Session {
  id              String
  tenantId        String
  deckId          String
  mode            String   @db.VarChar(10)
  status          String   @db.VarChar(12) @default("brouillon")
  maxParticipants Int
  joinCode        String   @db.VarChar(8)
  /// ⚠️ Valeur de RÉDACTION uniquement, lue une seule fois au figement de
  /// chaque question. Jamais lue en séance : le délai qui fait foi vit sur
  /// `Quiz_SessionQuestion.timeLimitResolved` (D10). La garder ici ne contredit
  /// donc pas D10, qui interdit que le délai FAISANT FOI y vive.
  defaultTimeLimit Int?
  guestLocale     String?  @db.VarChar(5)
  createdBy       String
  createdAt       DateTime @default(now())
  startedAt       DateTime?
  finishedAt      DateTime?

  deck         Quiz_Deck             @relation(fields: [deckId, tenantId], references: [id, tenantId], onDelete: Cascade)
  questions    Quiz_SessionQuestion[]
  participants Quiz_Participant[]

  @@id([id, tenantId])
  @@index([tenantId])
  @@index([tenantId, joinCode])
}

/// ⛔ LA QUESTION FIGÉE, et c'est la table la plus importante du module.
///
/// Copie prise au lancement de la séance (D10, même jurisprudence que D5 du
/// loto qui fige son jeu de cartes). Sans elle, corriger une question en pleine
/// séance changerait le sens des réponses déjà données.
///
/// `timeLimitResolved` est la SEULE source du délai qui fait foi :
/// `Quiz_Question.timeLimit` n'est qu'une valeur de rédaction, lue une fois ici.
model Quiz_SessionQuestion {
  id         String
  tenantId   String
  sessionId  String
  rank       Int
  /// Trace de l'origine, pour le retour de séance. Pas une clé étrangère : la
  /// question vivante peut être supprimée après la séance, et le retour doit
  /// rester lisible.
  questionId String
  prompt     String   @db.VarChar(400)
  imageId    String?
  imageAlt   String?  @db.VarChar(200)
  answerMode String   @db.VarChar(8)
  /// Figé au lancement. `null` en mode contrôle, qui n'a aucun minuteur (D6).
  timeLimitResolved Int?
  accentsSensibles  Boolean @default(true)
  casseSensible     Boolean @default(false)
  /// Les propositions et les réponses acceptées, figées en JSON : une séance
  /// n'a aucun besoin de les requêter, et des tables filles obligeraient à les
  /// dupliquer ligne par ligne au lancement de chaque séance.
  options         Json
  acceptedAnswers Json
  openedAt   DateTime?
  deadlineAt DateTime?
  closedAt   DateTime?

  session Quiz_Session   @relation(fields: [sessionId, tenantId], references: [id, tenantId], onDelete: Cascade)
  answers Quiz_Answer[]

  @@id([id, tenantId])
  @@unique([sessionId, rank, tenantId])
  @@index([tenantId, sessionId])
}

/// Une équipe, ou un élève seul. Le domaine ne connaît qu'un nombre (D4) ;
/// l'interface présente le choix solo / équipes.
model Quiz_Participant {
  id               String
  tenantId         String
  sessionId        String
  participantIndex Int
  /// Nom choisi par l'animatrice. NULL est le cas normal, pas un cas dégradé :
  /// le participant porte alors son nom dérivé. Même décision que l'issue #29
  /// pour les équipes du loto.
  name             String? @db.VarChar(40)
  score            Int     @default(0)

  session Quiz_Session   @relation(fields: [sessionId, tenantId], references: [id, tenantId], onDelete: Cascade)
  members Quiz_Member[]
  answers Quiz_Answer[]

  @@id([id, tenantId])
  @@unique([sessionId, participantIndex, tenantId])
  @@index([tenantId, sessionId])
}

/// L'invité derrière un participant. Permet de garder l'AUTEUR d'une réponse
/// même en mode équipes (D4), donc un retour nominatif sans exclure personne.
model Quiz_Member {
  id            String
  tenantId      String
  participantId String
  guestId       String
  displayName   String   @db.VarChar(32)
  joinedAt      DateTime @default(now())

  participant Quiz_Participant @relation(fields: [participantId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([participantId, guestId, tenantId])
  @@index([tenantId, participantId])
}

/// Une réponse.
model Quiz_Answer {
  id                 String
  tenantId           String
  sessionQuestionId  String
  participantId      String
  /// Qui a appuyé, même quand l'unité de score est l'équipe (D4).
  authorGuestId      String
  optionId           String?
  value              String? @db.VarChar(160)
  isCorrect          Boolean
  /// Enregistré dans les deux modes, mais ne pèse sur aucun score en contrôle
  /// (spec § 5.3) : il n'est là que pour le retour de séance.
  elapsedMs          Int
  /// ⚠️ CALCULÉ au moment de la réponse et STOCKÉ. Ce n'est pas de la
  /// dénormalisation paresseuse : recalculer après coup demanderait que la
  /// formule et les délais d'alors soient encore vrais, et D10 fige précisément
  /// parce qu'ils ne le resteront pas.
  points             Int
  answeredAt         DateTime @default(now())

  sessionQuestion Quiz_SessionQuestion @relation(fields: [sessionQuestionId, tenantId], references: [id, tenantId], onDelete: Cascade)
  participant     Quiz_Participant     @relation(fields: [participantId, tenantId], references: [id, tenantId], onDelete: Cascade)

  /// On répond UNE FOIS par question et par participant.
  @@id([id, tenantId])
  @@unique([sessionQuestionId, participantId, tenantId])
  @@index([tenantId, sessionQuestionId])
}
```

Et ajouter les relations inverses manquantes :

```prisma
// dans Quiz_Deck, après `questions Quiz_Question[]`
  sessions Quiz_Session[]
```

- [ ] **Step 2 : fusionner et regarder le SQL avant d'écrire la migration**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac
pnpm --filter @quetzal/db schema:merge
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/sql.log 2>&1; echo "CODE : $?"
grep -cE "^CREATE TABLE" /tmp/sql.log
grep -E "^ALTER TABLE|^DROP" /tmp/sql.log | head
```

Expected: **5** `CREATE TABLE`, et **aucun** `ALTER TABLE` ni `DROP` sur une
table existante. Si une instruction touche `Quiz_Deck` autrement que pour une
relation inverse (qui ne produit pas de SQL), un modèle a été altéré par erreur.

- [ ] **Step 3 : créer la migration et y ajouter les CHECK à la main**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/db prisma migrate dev --name add_quiz_session --create-only
```

Puis ajouter à la fin du `migration.sql` créé :

```sql
-- CLAUDE.md §9 : pas d'enum Postgres (ALTER TYPE bloquant), mais String +
-- CHECK + Zod. La CHECK est le dernier rempart, Zod refuse avant.
ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_mode_check"
  CHECK ("mode" IN ('defi', 'controle'));

ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_status_check"
  CHECK ("status" IN ('brouillon', 'ouverte', 'en-cours', 'terminee'));

ALTER TABLE "Quiz_SessionQuestion" ADD CONSTRAINT "Quiz_SessionQuestion_answerMode_check"
  CHECK ("answerMode" IN ('choix', 'saisie'));

-- Les bornes de la spec § 3.3, en base aussi : une valeur hors bornes écrite
-- directement rendrait une séance injouable sans qu'aucun écran ne le dise.
ALTER TABLE "Quiz_SessionQuestion" ADD CONSTRAINT "Quiz_SessionQuestion_timeLimit_check"
  CHECK ("timeLimitResolved" IS NULL OR ("timeLimitResolved" >= 3 AND "timeLimitResolved" <= 120));

ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_defaultTimeLimit_check"
  CHECK ("defaultTimeLimit" IS NULL OR ("defaultTimeLimit" >= 3 AND "defaultTimeLimit" <= 120));

-- Un participant au plus, et au moins un : une séance à zéro participant
-- maximum ne pourrait accueillir personne.
ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_maxParticipants_check"
  CHECK ("maxParticipants" >= 1 AND "maxParticipants" <= 60);

-- ⛔ Une réponse porte soit un identifiant de proposition, soit une valeur
-- saisie, jamais ni l'un ni l'autre : une ligne vide serait une réponse
-- indéchiffrable dans le retour de séance.
ALTER TABLE "Quiz_Answer" ADD CONSTRAINT "Quiz_Answer_option_ou_valeur_check"
  CHECK ("optionId" IS NOT NULL OR "value" IS NOT NULL);

-- Les points ne sont jamais négatifs : la propriété 1 de D7 en base.
ALTER TABLE "Quiz_Answer" ADD CONSTRAINT "Quiz_Answer_points_check"
  CHECK ("points" >= 0);
```

⚠️ `maxParticipants <= 60` reprend le plafond mesuré du loto (#32, 60 téléphones
tenus). Il doit valoir le même nombre que le `maxConcurrentPerSession` du
manifeste ; si l'un change, l'autre aussi.

- [ ] **Step 4 : appliquer, et vérifier les CHECK LÀ OÙ ELLES VIVENT**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/db prisma:migrate:deploy > /tmp/m.log 2>&1; echo "CODE : $?"
pnpm --filter @quetzal/db prisma:generate > /tmp/g.log 2>&1; echo "CODE : $?"
docker exec quetzal-postgres-1 psql -U test -d quetzal_test -tAc \
  "SELECT conname FROM pg_constraint WHERE conname LIKE 'Quiz_%check' ORDER BY conname;"
```

Expected: les **huit** contraintes listées. ⛔ Les lire dans `pg_constraint` et
non dans le modèle Prisma : le modèle n'exprime pas les CHECK, donc il ne
prouverait rien. C'est `CLAUDE.md` §11.

- [ ] **Step 5 : prouver qu'une CHECK refuse vraiment**

Une contrainte listée n'est pas une contrainte qui mord. Sonde jetable :

```bash
docker exec quetzal-postgres-1 psql -U test -d quetzal_test -c \
  "INSERT INTO \"Quiz_Session\" (id, \"tenantId\", \"deckId\", mode, status, \"maxParticipants\", \"joinCode\", \"createdBy\") VALUES ('sonde','t','d','pause','brouillon',6,'ABC','u');" 2>&1 | grep -oE "violates check constraint \"[^\"]+\""
```

Expected: `violates check constraint "Quiz_Session_mode_check"`. ⛔ Si l'insertion
réussit, la CHECK n'a pas été appliquée : relire le `migration.sql` et
`prisma:migrate:deploy`.

- [ ] **Step 6 : commit**

```bash
git add packages/module-quiz/prisma/models.prisma packages/db/prisma
git commit -m "feat(quiz): les cinq tables de la seance

Quiz_Session, Quiz_SessionQuestion, Quiz_Participant, Quiz_Member,
Quiz_Answer. Prefixe Quiz_ (CLAUDE.md §7), tenantId partout, cle
composite, UUID v7 par newId().

⛔ Quiz_SessionQuestion est la table la plus importante du module : la
question FIGEE au lancement (D10, meme jurisprudence que D5 du loto).
Son timeLimitResolved est la SEULE source du delai qui fait foi ;
Quiz_Session.defaultTimeLimit et Quiz_Question.timeLimit ne sont que des
valeurs de redaction, lues une fois au figement. Les deux commentaires ///
le disent, parce que c est exactement ce qu un lecteur presse recablerait.

Les options et reponses acceptees sont figees en JSON : une seance n a
aucun besoin de les requeter, et des tables filles obligeraient a les
dupliquer ligne par ligne a chaque lancement.

points est CALCULE a la reponse et STOCKE : recalculer apres coup
demanderait que la formule et les delais d alors soient encore vrais, et
D10 fige precisement parce qu ils ne le resteront pas.

Huit CHECK ecrites a la main, que Prisma ne sait pas exprimer. Verifiees
dans pg_constraint ET par une insertion fautive : une contrainte listee n
est pas une contrainte qui mord."
```

---

> **Suite.** Les tâches 7 à 20 sont dans
> [`2026-11-08-module-quiz-seance-3.md`](./2026-11-08-module-quiz-seance-3.md) :
> les ports et leur doublure, l'adaptateur Prisma, les huit cas d'usage, le
> contrôleur, la passerelle, les trois écrans avec le plancher d'accessibilité,
> l'e2e des deux modes, et la vérification complète.
>
> La coupure tombe sur une frontière propre : à la fin de cette tâche, le domaine
> est entier et testé, et le schéma est en place. Rien de ce qui suit ne les
> modifie.
