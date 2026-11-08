# Module Quiz — plan 2, suite : la séance (tâches 11 à 14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Suite de** [`2026-11-08-module-quiz-seance-4.md`](./2026-11-08-module-quiz-seance-4.md). Garde-fous du premier fichier toujours en vigueur.

**L'horloge est injectée, partout dans ces quatre tâches.** Un `Date.now()` appelé dans un cas d'usage rendrait intestables la grâce, l'échéance et le bonus — et ce sont justement les règles qui comptent. Le port est un simple `() => number`.

---

## Task 11 : ouvrir et fermer une question

**Files:**
- Create: `packages/module-quiz/src/application/run-question.use-case.ts`
- Test: `packages/module-quiz/src/application/run-question.use-case.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/application/run-question.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { NoQuestionOpenError, SessionNotFoundError } from '../domain/errors.js';
import { RunQuestionUseCase } from './run-question.use-case.js';
import { FakeSessionRepository, frozenQuestionOf, sessionOf } from './testing/fake-repositories.js';

const T0 = 1_700_000_000_000;

function build(maintenant = T0) {
  const sessions = new FakeSessionRepository();
  let horloge = maintenant;
  const useCase = new RunQuestionUseCase(sessions, () => horloge);
  return {
    sessions,
    useCase,
    avancerDe: (ms: number) => { horloge += ms; },
  };
}

describe('RunQuestionUseCase, ouverture', () => {
  it('ouvre la premiere question et pose son echeance a partir du delai fige', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { timeLimitResolved: 20 })],
    }));

    const ouverte = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.rank).toBe(1);
    expect(ouverte.deadlineAt?.getTime()).toBe(T0 + 20_000);
    expect(ouverte.openedAt?.getTime()).toBe(T0);
  });

  /**
   * ⛔ D6 : aucun minuteur en mode controle, donc aucune echeance. Poser une
   * echeance ici fermerait la question tout seul, alors que la spec veut que la
   * fin vienne du geste de l'animatrice.
   */
  it('n a aucune echeance en mode controle', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      mode: 'controle',
      questions: [frozenQuestionOf(1, { timeLimitResolved: null })],
    }));

    const ouverte = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.deadlineAt).toBeNull();
    expect(ouverte.openedAt?.getTime()).toBe(T0);
  });

  it('passe a la question suivante quand la precedente est fermee', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [
        frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 5) }),
        frozenQuestionOf(2),
      ],
    }));

    avancerDe(1_000);
    const ouverte = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.rank).toBe(2);
  });

  /**
   * ⛔ Spec §5.4 : « une session en cours a AU PLUS UNE question ouverte. »
   * Ouvrir la suivante pendant qu'une autre est ouverte laisserait deux
   * questions recevables en meme temps, donc des reponses impossibles a
   * rattacher a ce que la classe regarde.
   */
  it('refuse d ouvrir la suivante quand une question est encore ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [
        frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: null }),
        frozenQuestionOf(2),
      ],
    }));

    await expect(useCase.openNext({ sessionId: 'session-1' })).rejects.toThrow();
  });

  it('refuse quand il ne reste aucune question a ouvrir', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 1) })],
    }));

    await expect(useCase.openNext({ sessionId: 'session-1' })).rejects.toThrow();
  });

  it('refuse sur une seance qui n est pas en cours', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'ouverte', questions: [frozenQuestionOf(1)] }));

    await expect(useCase.openNext({ sessionId: 'session-1' })).rejects.toThrow();
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();
    await expect(useCase.openNext({ sessionId: 'fantome' })).rejects.toThrow(SessionNotFoundError);
  });
});

describe('RunQuestionUseCase, fermeture', () => {
  it('ferme la question ouverte et rend le compte des reponses', async () => {
    const { sessions, useCase, avancerDe } = build();
    const question = frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) });
    sessions.add(sessionOf({ status: 'en-cours', questions: [question] }));
    await sessions.recordAnswer({
      sessionQuestionId: question.id, participantId: 'p-1', authorGuestId: 'g-1',
      optionId: 'o-juste-1', value: null, isCorrect: true, elapsedMs: 900, points: 1200,
    });
    await sessions.recordAnswer({
      sessionQuestionId: question.id, participantId: 'p-2', authorGuestId: 'g-2',
      optionId: 'o-faux-1', value: null, isCorrect: false, elapsedMs: 1500, points: 0,
    });

    avancerDe(8_000);
    const resultat = await useCase.close({ sessionId: 'session-1' });

    expect(resultat.answerCount).toBe(2);
    expect(resultat.correctCount).toBe(1);
    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 8_000);
  });

  it('refuse de fermer quand aucune question n est ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: null })],
    }));

    await expect(useCase.close({ sessionId: 'session-1' })).rejects.toThrow(NoQuestionOpenError);
  });

  /**
   * ⛔ Fermer DEUX FOIS ne doit pas ecraser le premier horodatage : la grace et
   * le refus se calculent dessus, et le reecrire rouvrirait une fenetre deja
   * close. Un double clic de l'animatrice suffit a declencher le cas.
   */
  it('refuse une seconde fermeture, plutot que d ecraser l horodatage', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
    }));

    avancerDe(3_000);
    await useCase.close({ sessionId: 'session-1' });
    avancerDe(3_000);

    await expect(useCase.close({ sessionId: 'session-1' })).rejects.toThrow(NoQuestionOpenError);
    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 3_000);
  });
});

describe('RunQuestionUseCase, question courante', () => {
  it('rend la question ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: null })],
    }));

    expect((await useCase.current({ sessionId: 'session-1' }))?.rank).toBe(1);
  });

  it('rend null quand aucune question n est ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours', questions: [frozenQuestionOf(1)] }));

    expect(await useCase.current({ sessionId: 'session-1' })).toBeNull();
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/run-question.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './run-question.use-case.js'`.

- [ ] **Step 3 : écrire le cas d'usage**

`packages/module-quiz/src/application/run-question.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import {
  InvalidSessionTransitionError,
  NoQuestionOpenError,
  SessionNotFoundError,
} from '../domain/errors.js';
import type { FrozenQuestion, Session, SessionRepository } from '../domain/ports/session.repository.js';

/**
 * L'horloge, injectée. Un `Date.now()` appelé ici rendrait intestables la
 * grâce, l'échéance et le bonus — et ce sont justement les règles qui comptent.
 */
export type Horloge = () => number;

export interface FermetureResultat {
  sessionQuestionId: string;
  answerCount: number;
  correctCount: number;
}

@Injectable()
export class RunQuestionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly maintenant: Horloge,
    private readonly eventBus?: EventBus,
  ) {}

  /**
   * La question ouverte, ou `null`. Une question est ouverte quand elle a un
   * `openedAt` et pas de `closedAt` : l'échéance ne la ferme PAS, elle rend
   * seulement les réponses irrecevables (D8, évaluation paresseuse).
   */
  async current(input: { sessionId: string }): Promise<FrozenQuestion | null> {
    const session = await this.require(input.sessionId);
    return this.ouverteDe(session);
  }

  async openNext(input: { sessionId: string }): Promise<FrozenQuestion> {
    const session = await this.require(input.sessionId);
    if (session.status !== 'en-cours') {
      throw new InvalidSessionTransitionError(session.status, 'en-cours');
    }

    // Spec § 5.4 : au plus UNE question ouverte. Deux questions recevables en
    // même temps rendraient des réponses impossibles à rattacher à ce que la
    // classe regarde.
    if (this.ouverteDe(session) !== null) {
      throw new InvalidSessionTransitionError('question-ouverte', 'question-suivante');
    }

    const suivante = session.questions.find((q) => q.openedAt === null);
    if (suivante === undefined) {
      throw new NoQuestionOpenError(`${session.id} (plus aucune question à ouvrir)`);
    }

    const openedAt = new Date(this.maintenant());
    // ⛔ L'échéance vient du délai FIGÉ, et de lui seul (D10). En mode contrôle
    // il est nul, donc aucune échéance : la fin vient du geste de l'animatrice.
    const deadlineAt =
      suivante.timeLimitResolved === null
        ? null
        : new Date(openedAt.getTime() + suivante.timeLimitResolved * 1000);

    await this.sessions.openQuestion({
      sessionQuestionId: suivante.id,
      openedAt,
      deadlineAt,
    });

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.question.opened', {
        sessionId: session.id,
        sessionQuestionId: suivante.id,
        rank: suivante.rank,
        timeLimitResolved: suivante.timeLimitResolved,
      });
    }

    return { ...suivante, openedAt, deadlineAt };
  }

  async close(input: { sessionId: string }): Promise<FermetureResultat> {
    const session = await this.require(input.sessionId);
    const ouverte = this.ouverteDe(session);
    // ⛔ Un refus, et non une fermeture idempotente silencieuse : réécrire
    // `closedAt` rouvrirait une fenêtre déjà close, puisque la grâce et le
    // refus se calculent dessus. Un double clic suffit à déclencher le cas.
    if (ouverte === null) throw new NoQuestionOpenError(session.id);

    const closedAt = new Date(this.maintenant());
    await this.sessions.closeQuestion({ sessionQuestionId: ouverte.id, closedAt });

    const reponses = await this.sessions.answersFor(ouverte.id);
    const resultat: FermetureResultat = {
      sessionQuestionId: ouverte.id,
      answerCount: reponses.length,
      correctCount: reponses.filter((r) => r.isCorrect).length,
    };

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.question.closed', {
        sessionId: session.id,
        sessionQuestionId: ouverte.id,
        answerCount: resultat.answerCount,
        correctCount: resultat.correctCount,
      });
    }

    return resultat;
  }

  private ouverteDe(session: Session): FrozenQuestion | null {
    return session.questions.find((q) => q.openedAt !== null && q.closedAt === null) ?? null;
  }

  private async require(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/run-question.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 11 tests verts.

- [ ] **Step 5 : prouver les trois gardes par mutation**

```bash
cp packages/module-quiz/src/application/run-question.use-case.ts /tmp/rq.bak

echo "### M1 : deux questions peuvent etre ouvertes en meme temps"
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/application/run-question.use-case.ts';
let t=fs.readFileSync(f,'utf8');
t=t.replace(\"    if (this.ouverteDe(session) !== null) {\n      throw new InvalidSessionTransitionError('question-ouverte', 'question-suivante');\n    }\n\",'');
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/run-question.use-case.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "encore ouverte" /tmp/v1.log | head -2
cp /tmp/rq.bak packages/module-quiz/src/application/run-question.use-case.ts

echo "### M2 : la seconde fermeture ecrase l horodatage"
sed -i "s|    if (ouverte === null) throw new NoQuestionOpenError(session.id);|    if (ouverte === null) { const q = session.questions.find((c) => c.openedAt !== null); if (q === undefined) throw new NoQuestionOpenError(session.id); await this.sessions.closeQuestion({ sessionQuestionId: q.id, closedAt: new Date(this.maintenant()) }); return { sessionQuestionId: q.id, answerCount: 0, correctCount: 0 }; }|" packages/module-quiz/src/application/run-question.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/run-question.use-case.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "seconde fermeture" /tmp/v2.log | head -2
cp /tmp/rq.bak packages/module-quiz/src/application/run-question.use-case.ts

echo "### M3 : le mode controle recoit une echeance"
sed -i "s|      suivante.timeLimitResolved === null|      false|" packages/module-quiz/src/application/run-question.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/run-question.use-case.spec.ts > /tmp/v3.log 2>&1; echo "CODE : $?"
grep -E "aucune echeance en mode controle" /tmp/v3.log | head -2
cp /tmp/rq.bak packages/module-quiz/src/application/run-question.use-case.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/run-question.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1, M2, M3 chacune **CODE : 1** sur le test nommé, puis **CODE : 0**.

⚠️ Pour M3, `timeLimitResolved === null` remplacé par `false` donnera peut-être
une erreur de type (`null * 1000`). C'est un **échec valable** : la mutation
casse à la compilation, ce qui est une preuve plus forte qu'un test rouge. Le
noter comme tel.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/application/run-question.use-case.spec.ts
git commit -m "test(quiz): exiger au plus une question ouverte, et une fermeture non reecrite

Spec §5.4 et D8. Vu rouge d abord.

L horloge est INJECTEE, et c est ce qui rend ces tests possibles : un
Date.now() dans le cas d usage rendrait intestables la grace, l echeance
et le bonus, soit exactement les regles qui comptent.

Trois tests portent des pieges :

- au plus UNE question ouverte. Deux questions recevables en meme temps
  rendraient des reponses impossibles a rattacher a ce que la classe
  regarde.
- une seconde fermeture est REFUSEE plutot que d ecraser l horodatage :
  la grace et le refus se calculent dessus, donc le reecrire rouvrirait
  une fenetre deja close. Un double clic de l animatrice suffit.
- aucune echeance en mode controle (D6) : en poser une fermerait la
  question tout seule, alors que la fin doit venir du geste de l
  animatrice."
git add packages/module-quiz/src/application/run-question.use-case.ts
git commit -m "feat(quiz): ouvrir et fermer une question

L echeance vient du delai FIGE et de lui seul (D10). Une question est
ouverte quand elle a un openedAt sans closedAt : l echeance ne la ferme
PAS, elle rend seulement les reponses irrecevables — D8, evaluation
paresseuse.

Verifie par mutation : autoriser deux questions ouvertes, reecrire l
horodatage de fermeture, ou poser une echeance en mode controle font
chacune rougir."
```

---

## Task 12 : enregistrer une réponse

C'est le cœur du module : la seule tâche qui met en jeu les quatre règles pures
ensemble.

**Files:**
- Create: `packages/module-quiz/src/application/answer-question.use-case.ts`
- Test: `packages/module-quiz/src/application/answer-question.use-case.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/application/answer-question.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { BASE, BONUS_MAX, GRACE_MS } from '../domain/scoring.js';
import {
  AlreadyAnsweredError,
  AnswerTooLateError,
  NoQuestionOpenError,
} from '../domain/errors.js';
import { AnswerQuestionUseCase } from './answer-question.use-case.js';
import { FakeSessionRepository, frozenQuestionOf, sessionOf } from './testing/fake-repositories.js';

const T0 = 1_700_000_000_000;

function build(questions = [frozenQuestionOf(1, {
  openedAt: new Date(T0),
  deadlineAt: new Date(T0 + 20_000),
  timeLimitResolved: 20,
})]) {
  const sessions = new FakeSessionRepository();
  let horloge = T0;
  sessions.add(sessionOf({
    status: 'en-cours',
    questions,
    participants: [
      { id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] },
      { id: 'p-2', participantIndex: 2, name: null, score: 0, memberNames: ['Bea'] },
    ],
  }));
  const useCase = new AnswerQuestionUseCase(sessions, () => horloge);
  return { sessions, useCase, avancerDe: (ms: number) => { horloge += ms; } };
}

const ANA = { sessionId: 'session-1', participantId: 'p-1', guestId: 'g-1' };

describe('AnswerQuestionUseCase, mode defi', () => {
  it('accepte une proposition juste et rend le bonus plein a l instant zero', async () => {
    const { useCase, sessions } = build();

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.isCorrect).toBe(true);
    expect(r.points).toBe(BASE + BONUS_MAX);
    expect((await sessions.findById('session-1'))?.participants[0]?.score).toBe(BASE + BONUS_MAX);
  });

  it('accepte une proposition fausse, et elle vaut zero', async () => {
    const { useCase, sessions } = build();

    const r = await useCase.execute({ ...ANA, optionId: 'o-faux-1' });

    expect(r.isCorrect).toBe(false);
    expect(r.points).toBe(0);
    expect((await sessions.findById('session-1'))?.participants[0]?.score).toBe(0);
  });

  it('decroit le bonus avec le temps', async () => {
    const { useCase, avancerDe } = build();
    avancerDe(10_000);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(BASE + Math.round(BONUS_MAX / 2));
  });

  /**
   * ⛔ LA GRACE, bout en bout : acceptee, et sans bonus. C'est la rencontre de
   * la regle de fermeture (D8) et du bareme (D7 propriete 3) — la seule facon
   * de verifier qu'elles sont bien cablees ensemble.
   */
  it('accepte dans la grace, et la paie BASE sans bonus', async () => {
    const { useCase, avancerDe } = build();
    avancerDe(20_000 + GRACE_MS - 1);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(BASE);
    expect(r.dansLaGrace).toBe(true);
  });

  it('refuse apres la grace', async () => {
    const { useCase, avancerDe, sessions } = build();
    avancerDe(20_000 + GRACE_MS + 1);

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      AnswerTooLateError,
    );
    // ⛔ Et RIEN n'est ecrit : un refus qui enregistrerait quand meme la
    // reponse la ferait apparaitre dans le retour de seance.
    expect(sessions.answers).toHaveLength(0);
  });

  it('refuse apres une fermeture manuelle, meme avant l echeance', async () => {
    const { useCase, avancerDe } = build([
      frozenQuestionOf(1, {
        openedAt: new Date(T0),
        deadlineAt: new Date(T0 + 20_000),
        closedAt: new Date(T0 + 4_000),
      }),
    ]);
    avancerDe(5_000);

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      AnswerTooLateError,
    );
  });

  /**
   * ⛔ ON REPOND UNE FOIS. Deux doigts sur un telephone d'eleve suffisent a
   * declencher deux emissions, et le second ne doit ni marquer de points ni
   * rendre un 500.
   */
  it('refuse une seconde reponse du meme participant, sans doubler son score', async () => {
    const { useCase, sessions } = build();

    const premiere = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });
    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      AlreadyAnsweredError,
    );

    expect((await sessions.findById('session-1'))?.participants[0]?.score).toBe(premiere.points);
    expect(sessions.answers).toHaveLength(1);
  });

  it('laisse un AUTRE participant repondre a la meme question', async () => {
    const { useCase, sessions } = build();

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });
    await useCase.execute({
      sessionId: 'session-1', participantId: 'p-2', guestId: 'g-2', optionId: 'o-faux-1',
    });

    expect(sessions.answers).toHaveLength(2);
  });

  /**
   * ⛔ D5 : le serveur ne tient AUCUN compte de ce que le client affirme sur sa
   * propre justesse. Envoyer l'identifiant d'une proposition qui n'existe pas
   * est faux, jamais une erreur a exploiter.
   */
  it('traite un identifiant de proposition inconnu comme FAUX, et non comme une panne', async () => {
    const { useCase } = build();

    const r = await useCase.execute({ ...ANA, optionId: 'o-inventee' });

    expect(r.isCorrect).toBe(false);
    expect(r.points).toBe(0);
  });

  it('traite une saisie envoyee a une question a choix comme fausse', async () => {
    const { useCase } = build();

    const r = await useCase.execute({ ...ANA, value: 'la silla' });

    expect(r.isCorrect).toBe(false);
  });

  it('refuse quand aucune question n est ouverte', async () => {
    const { useCase } = build([frozenQuestionOf(1, { openedAt: null })]);

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      NoQuestionOpenError,
    );
  });

  it('enregistre le temps ecoule, meme quand la reponse est fausse', async () => {
    const { useCase, sessions, avancerDe } = build();
    avancerDe(3_400);

    await useCase.execute({ ...ANA, optionId: 'o-faux-1' });

    expect(sessions.answers[0]?.elapsedMs).toBe(3_400);
  });

  /**
   * ⛔ L'AUTEUR est garde meme quand l'unite de score est l'equipe (D4) : c'est
   * ce qui rend le retour de seance nominatif sans exclure personne du jeu.
   */
  it('garde le guestId de l auteur sur la reponse', async () => {
    const { useCase, sessions } = build();

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(sessions.answers[0]?.authorGuestId).toBe('g-1');
  });
});

describe('AnswerQuestionUseCase, mode controle', () => {
  function enControle() {
    const sessions = new FakeSessionRepository();
    let horloge = T0;
    sessions.add(sessionOf({
      status: 'en-cours',
      mode: 'controle',
      questions: [frozenQuestionOf(1, {
        openedAt: new Date(T0),
        deadlineAt: null,
        timeLimitResolved: null,
      })],
      participants: [{ id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] }],
    }));
    return {
      sessions,
      useCase: new AnswerQuestionUseCase(sessions, () => horloge),
      avancerDe: (ms: number) => { horloge += ms; },
    };
  }

  it('paie un point pour une reponse juste, et rien de plus', async () => {
    const { useCase } = enControle();

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(1);
  });

  /**
   * ⛔ Aucune pression de vitesse (D6) : une reponse apres trois minutes vaut
   * exactement la meme chose qu'une reponse immediate. C'est la condition qui
   * fait du mode controle le canal alternatif exige par la spec §8.
   */
  it('paie pareil apres trois minutes, puisqu il n y a aucun minuteur', async () => {
    const { useCase, avancerDe } = enControle();
    avancerDe(180_000);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(1);
    expect(r.dansLaGrace).toBe(false);
  });

  it('enregistre tout de meme le temps, pour le retour de seance', async () => {
    const { useCase, sessions, avancerDe } = enControle();
    avancerDe(42_000);

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(sessions.answers[0]?.elapsedMs).toBe(42_000);
  });
});

describe('AnswerQuestionUseCase, mode saisie', () => {
  function enSaisie() {
    const sessions = new FakeSessionRepository();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, {
        answerMode: 'saisie',
        options: [],
        acceptedAnswers: ['la casa', 'el hogar'],
        regles: { accentsSensibles: false, casseSensible: false },
        openedAt: new Date(T0),
        deadlineAt: new Date(T0 + 20_000),
      })],
      participants: [{ id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] }],
    }));
    return { sessions, useCase: new AnswerQuestionUseCase(sessions, () => T0) };
  }

  it('accepte une variante listee', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: 'el hogar' })).isCorrect).toBe(true);
  });

  it('applique les drapeaux de la question FIGEE', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: '  LA  CÁSA ' })).isCorrect).toBe(true);
  });

  it('refuse un mot different', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: 'la cosa' })).isCorrect).toBe(false);
  });

  it('refuse une saisie vide, sans lever', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: '   ' })).isCorrect).toBe(false);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './answer-question.use-case.js'`.

- [ ] **Step 3 : écrire le cas d'usage**

`packages/module-quiz/src/application/answer-question.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import { estJuste, type QuestionJouable } from '../domain/answer-check.js';
import { accueilDeLaReponse } from '../domain/deadline.js';
import { pointsPour } from '../domain/scoring.js';
import {
  AlreadyAnsweredError,
  AnswerTooLateError,
  NoQuestionOpenError,
  SessionNotFoundError,
} from '../domain/errors.js';
import type { FrozenQuestion, Session, SessionRepository } from '../domain/ports/session.repository.js';
import type { Horloge } from './run-question.use-case.js';

export interface ReponseEnregistree {
  answerId: string;
  sessionQuestionId: string;
  participantId: string;
  isCorrect: boolean;
  points: number;
  dansLaGrace: boolean;
  elapsedMs: number;
}

/**
 * Le cœur du module : la seule place où les quatre règles pures se rencontrent.
 * Elle n'en contient aucune — elle les orchestre, dans cet ordre, et l'ordre
 * compte.
 */
@Injectable()
export class AnswerQuestionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly maintenant: Horloge,
    private readonly eventBus?: EventBus,
  ) {}

  async execute(input: {
    sessionId: string;
    participantId: string;
    guestId: string;
    optionId?: string;
    value?: string;
  }): Promise<ReponseEnregistree> {
    const session = await this.require(input.sessionId);
    const question = session.questions.find(
      (q) => q.openedAt !== null && q.closedAt === null,
    );
    if (question === undefined || question.openedAt === null) {
      throw new NoQuestionOpenError(session.id);
    }

    const arriveeMs = this.maintenant();

    // 1. Recevable ? D8, évaluation paresseuse, aucun minuteur serveur.
    const accueil = accueilDeLaReponse(
      {
        deadlineAt: question.deadlineAt === null ? null : question.deadlineAt.getTime(),
        closedAt: question.closedAt === null ? null : question.closedAt.getTime(),
      },
      arriveeMs,
    );
    // ⛔ Le refus sort AVANT toute écriture : enregistrer une réponse refusée la
    // ferait apparaître dans le retour de séance.
    if (accueil.kind === 'trop-tard') throw new AnswerTooLateError(accueil.raison);

    // 2. Juste ? Sur la question FIGÉE, jamais sur la question vivante (D10).
    const isCorrect = estJuste(this.jouable(question), {
      ...(input.optionId === undefined ? {} : { optionId: input.optionId }),
      ...(input.value === undefined ? {} : { texte: input.value }),
    });

    // 3. Combien ? La grâce est passée au barème en poussant l'arrivée sur
    // l'échéance exacte : le reste vaut alors zéro, donc BASE sans bonus.
    // C'est la propriété 3 de D7, obtenue sans cas particulier.
    const arriveePourLeBareme =
      accueil.kind === 'dans-la-grace' && question.deadlineAt !== null
        ? question.deadlineAt.getTime()
        : arriveeMs;

    const points = pointsPour(
      {
        mode: session.mode,
        openedAt: question.openedAt.getTime(),
        deadlineAt: question.deadlineAt === null ? null : question.deadlineAt.getTime(),
      },
      { isCorrect, arriveeMs: arriveePourLeBareme },
    );

    const elapsedMs = arriveeMs - question.openedAt.getTime();

    // 4. Écrire. `null` signifie « a déjà répondu » : l'unicité vit en base.
    const ligne = await this.sessions.recordAnswer({
      sessionQuestionId: question.id,
      participantId: input.participantId,
      authorGuestId: input.guestId,
      optionId: input.optionId ?? null,
      value: input.value ?? null,
      isCorrect,
      elapsedMs,
      points,
    });
    if (ligne === null) throw new AlreadyAnsweredError(input.participantId);

    // Après l'écriture seulement : un score incrémenté sur une réponse refusée
    // par l'unicité doublerait le total au second appui.
    if (points > 0) {
      await this.sessions.addToScore({ participantId: input.participantId, points });
    }

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.answer.recorded', {
        sessionId: session.id,
        sessionQuestionId: question.id,
        participantId: input.participantId,
        isCorrect,
        points,
      });
    }

    return {
      answerId: ligne.id,
      sessionQuestionId: question.id,
      participantId: input.participantId,
      isCorrect,
      points,
      dansLaGrace: accueil.kind === 'dans-la-grace',
      elapsedMs,
    };
  }

  /** La question figée, ramenée à ce que la règle pure attend. */
  private jouable(question: FrozenQuestion): QuestionJouable {
    if (question.answerMode === 'choix') {
      return {
        answerMode: 'choix',
        options: question.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      };
    }
    return {
      answerMode: 'saisie',
      acceptedAnswers: question.acceptedAnswers,
      regles: question.regles,
    };
  }

  private async require(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 21 tests verts.

- [ ] **Step 5 : prouver les quatre gardes d'ordre par mutation**

Aucune de ces quatre erreurs ne se voit à la lecture : ce sont des ordres.

```bash
cp packages/module-quiz/src/application/answer-question.use-case.ts /tmp/aq.bak

echo "### M1 : la grace rapporte un bonus"
sed -i "s|        ? question.deadlineAt.getTime()|        ? arriveeMs|" packages/module-quiz/src/application/answer-question.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "dans la grace, et la paie BASE" /tmp/v1.log | head -2
cp /tmp/aq.bak packages/module-quiz/src/application/answer-question.use-case.ts

echo "### M2 : le score est incremente AVANT l ecriture"
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/application/answer-question.use-case.ts';
let t=fs.readFileSync(f,'utf8');
const bloc='    if (points > 0) {\n      await this.sessions.addToScore({ participantId: input.participantId, points });\n    }\n';
if(!t.includes(bloc)){console.error('ancre introuvable');process.exit(1);}
t=t.replace(bloc,'');
t=t.replace('    const ligne = await this.sessions.recordAnswer({', bloc+'\n    const ligne = await this.sessions.recordAnswer({');
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "sans doubler son score" /tmp/v2.log | head -2
cp /tmp/aq.bak packages/module-quiz/src/application/answer-question.use-case.ts

echo "### M3 : le refus arrive APRES l ecriture"
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/application/answer-question.use-case.ts';
let t=fs.readFileSync(f,'utf8');
const l=\"    if (accueil.kind === 'trop-tard') throw new AnswerTooLateError(accueil.raison);\n\";
t=t.replace(l,'');
t=t.replace('    if (ligne === null) throw new AlreadyAnsweredError(input.participantId);', '    if (ligne === null) throw new AlreadyAnsweredError(input.participantId);\n'+l);
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v3.log 2>&1; echo "CODE : $?"
grep -E "refuse apres la grace" /tmp/v3.log | head -2
cp /tmp/aq.bak packages/module-quiz/src/application/answer-question.use-case.ts

echo "### M4 : l auteur n est plus garde"
sed -i "s|      authorGuestId: input.guestId,|      authorGuestId: '',|" packages/module-quiz/src/application/answer-question.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v4.log 2>&1; echo "CODE : $?"
grep -E "guestId de l auteur" /tmp/v4.log | head -2
cp /tmp/aq.bak packages/module-quiz/src/application/answer-question.use-case.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/answer-question.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: M1 à M4 chacune **CODE : 1** sur le test nommé, puis **CODE : 0** et
21 verts.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/application/answer-question.use-case.spec.ts
git commit -m "test(quiz): exiger que les quatre regles soient cablees dans le bon ordre

Le coeur du module : la seule place ou la validation, la normalisation,
la fermeture et le bareme se rencontrent. Vu rouge d abord.

Quatre tests portent des ORDRES, qui ne se voient dans aucune signature :

- la grace est acceptee ET payee BASE sans bonus. C est la rencontre de
  D8 et de la propriete 3 de D7, et le seul moyen de verifier qu elles
  sont cablees ensemble.
- un refus n ecrit RIEN : enregistrer une reponse refusee la ferait
  apparaitre dans le retour de seance.
- une seconde reponse ne double pas le score. Deux doigts sur un
  telephone d eleve suffisent a declencher deux emissions.
- l AUTEUR est garde meme quand l unite de score est l equipe (D4), et c
  est ce qui rend le retour nominatif sans exclure personne du jeu.

Deux tests gardent D5 : un identifiant de proposition inconnu, ou une
saisie envoyee a une question a choix, sont FAUX et jamais une panne. Un
client malveillant ne doit obtenir ni point ni exception a exploiter."
git add packages/module-quiz/src/application/answer-question.use-case.ts
git commit -m "feat(quiz): enregistrer une reponse

Ce cas d usage ne contient AUCUNE regle : il orchestre les quatre pures,
dans un ordre qui compte.

La grace est passee au bareme en poussant l arrivee sur l echeance
exacte : le reste vaut alors zero, donc BASE sans bonus. La propriete 3
de D7 s obtient ainsi sans cas particulier a maintenir.

Le score est incremente APRES l ecriture, et seulement si elle a reussi :
l inverse doublerait le total au second appui.

Verifie par mutation : les quatre ordres font chacun rougir un test
nomme."
```

---

> **Suite.** Les tâches 13 à 20 sont dans
> [`2026-11-08-module-quiz-seance-6.md`](./2026-11-08-module-quiz-seance-6.md) :
> terminer la séance, le retour de séance (D12), le contrôleur HTTP, la
> passerelle et le diffuseur, les trois écrans avec le plancher d'accessibilité,
> l'e2e des deux modes, et la vérification complète.
