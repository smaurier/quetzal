# Module Quiz, plan 2, suite : la séance (tâches 9 et 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Suite de** [`2026-11-08-module-quiz-seance-3.md`](./2026-11-08-module-quiz-seance-3.md). Garde-fous du premier fichier toujours en vigueur : base locale gardée dans le même appel, vérification **par paquet**, **code de sortie explicite**.

Ces quatre tâches sont les cas d'usage. Toutes se testent contre la doublure de la tâche 7, qui applique l'unicité comme la base.

---

## Task 9 : créer une séance, l'ouvrir, et figer sa banque

**Files:**
- Create: `packages/module-quiz/src/application/manage-session.use-case.ts`
- Test: `packages/module-quiz/src/application/manage-session.use-case.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/application/manage-session.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  InvalidSessionTransitionError,
  SessionNotFoundError,
  TimeLimitUnresolvableError,
} from '../domain/errors.js';
import { ManageSessionUseCase } from './manage-session.use-case.js';
import {
  FakeQuestionBankRepository,
  FakeSessionRepository,
  bankOf,
  questionOf,
  sessionOf,
} from './testing/fake-repositories.js';

function build() {
  const banks = new FakeQuestionBankRepository();
  const sessions = new FakeSessionRepository();
  const useCase = new ManageSessionUseCase(sessions, banks);
  return { banks, sessions, useCase };
}

describe('ManageSessionUseCase, creation', () => {
  it('cree une seance en brouillon avec un code d entree', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(4));

    const session = await useCase.create({
      deckId: 'bank-1',
      mode: 'defi',
      maxParticipants: 6,
      defaultTimeLimit: 20,
      createdBy: 'u-1',
    });

    expect(session.status).toBe('brouillon');
    expect(session.joinCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  /**
   * ⛔ Deux seances ne doivent pas partager un code : les eleves scannent un QR
   * code, et deux classes voisines tomberaient dans la meme partie.
   */
  it('ne frappe pas deux fois le meme code d entree', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(4));

    const codes = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const s = await useCase.create({
        deckId: 'bank-1', mode: 'defi', maxParticipants: 6,
        defaultTimeLimit: 20, createdBy: 'u-1',
      });
      codes.add(s.joinCode);
    }
    expect(codes.size).toBe(40);
  });

  it('refuse une banque inconnue', async () => {
    const { useCase } = build();
    await expect(
      useCase.create({
        deckId: 'fantome', mode: 'defi', maxParticipants: 6,
        defaultTimeLimit: 20, createdBy: 'u-1',
      })).rejects.toThrow();
  });
});

describe('ManageSessionUseCase, ouverture', () => {
  it('passe de brouillon a ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'brouillon', questions: [] }));

    await useCase.open({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('ouverte');
  });

  it('refuse d ouvrir une seance deja en cours', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours' }));

    await expect(useCase.open({ sessionId: 'session-1' })).rejects.toThrow(
      InvalidSessionTransitionError);
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();
    await expect(useCase.open({ sessionId: 'fantome' })).rejects.toThrow(SessionNotFoundError);
  });
});

describe('ManageSessionUseCase, demarrage et figement', () => {
  /**
   * ⛔ LE COEUR DE D10. Au demarrage, la banque est COPIEE sur la seance, avec
   * son delai deja resolu. Rien ne relira la question vivante ensuite.
   */
  it('fige la banque au demarrage, avec les delais resolus', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, {
      questions: [
        questionOf(1, { timeLimit: 45 }),
        questionOf(2, { timeLimit: null }),
      ],
    }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: 20 }));

    await useCase.start({ sessionId: 'session-1' });

    const session = await sessions.findById('session-1');
    expect(session?.status).toBe('en-cours');
    expect(session?.questions.map((q) => q.timeLimitResolved)).toEqual([45, 20]);
  });

  /**
   * ⛔ Une correction de la question APRES le demarrage ne doit rien changer a
   * la seance en cours. C'est la raison d'etre du figement, et le test le
   * prouve en modifiant la banque entre les deux.
   */
  it('ignore une correction de la banque faite apres le demarrage', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1, { prompt: 'avant', timeLimit: 30 })] }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: 20 }));

    await useCase.start({ sessionId: 'session-1' });
    const questionId = (await banks.findById('bank-1'))!.questions[0]!.id;
    await banks.updateQuestion(questionId, { prompt: 'apres', timeLimit: 90 });

    const session = await sessions.findById('session-1');
    expect(session?.questions[0]?.prompt).toBe('avant');
    expect(session?.questions[0]?.timeLimitResolved).toBe(30);
  });

  /**
   * ⛔ En mode controle, aucun delai n'est fige, et ce n'est pas un refus : D6
   * retire le minuteur de ce mode, donc WCAG 2.2.1 ne s'y applique pas.
   */
  it('fige des delais nuls en mode controle, meme si la question en porte un', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1, { timeLimit: 45 })] }));
    sessions.add(sessionOf({ status: 'ouverte', mode: 'controle', questions: [], defaultTimeLimit: null }));

    await useCase.start({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.timeLimitResolved).toBeNull();
  });

  /**
   * ⛔ ET LE REFUS QUI SAUVE LA SEANCE. Une question de defi sans delai ni
   * defaut de session est injouable. Refuser AU DEMARRAGE, donc avant que la
   * classe regarde l'ecran, est tout l'interet : le decouvrir en jouant serait
   * le pire moment.
   */
  it('refuse de demarrer un defi dont une question n a aucun delai resoluble', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, {
      questions: [questionOf(1, { timeLimit: 20 }), questionOf(2, { timeLimit: null })],
    }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: null }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow(
      TimeLimitUnresolvableError);
  });

  it('ne fige rien du tout quand une seule question est irresoluble', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, {
      questions: [questionOf(1, { timeLimit: 20 }), questionOf(2, { timeLimit: null })],
    }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: null }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow();

    // Tout ou rien : une seance a moitie figee est le pire etat possible.
    expect((await sessions.findById('session-1'))?.questions).toHaveLength(0);
    expect((await sessions.findById('session-1'))?.status).toBe('ouverte');
  });

  it('refuse de demarrer une banque vide', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, { questions: [] }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [] }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow();
  });

  it('refuse de demarrer depuis un brouillon, sans passer par ouverte', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(2));
    sessions.add(sessionOf({ status: 'brouillon', questions: [] }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow(
      InvalidSessionTransitionError);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/manage-session.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './manage-session.use-case.js'`.

- [ ] **Step 3 : écrire le cas d'usage**

`packages/module-quiz/src/application/manage-session.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import {
  BankNotFoundError,
  InvalidSessionTransitionError,
  SessionNotFoundError,
  TimeLimitUnresolvableError,
} from '../domain/errors.js';
import { resoudreLeDelai } from '../domain/time-limit.js';
import { peutPasserA } from '../domain/session-status.js';
import type { SessionMode } from '../domain/session-mode.js';
import type { SessionStatus } from '../domain/session-status.js';
import type { QuestionBankRepository } from '../domain/ports/question-bank.repository.js';
import type { FrozenQuestion, Session, SessionRepository } from '../domain/ports/session.repository.js';

const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Huit caractères, sans `I`, `O`, `0` ni `1` : le code est lu sur un
 * vidéoprojecteur et retapé sur un téléphone, et ces quatre-là se confondent.
 * Même raisonnement que le `joinCode` du loto.
 */
function frapperUnCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += ALPHABET_CODE[Math.floor(Math.random() * ALPHABET_CODE.length)];
  }
  return code;
}

@Injectable()
export class ManageSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly banks: QuestionBankRepository,
    private readonly eventBus?: EventBus) {}

  async create(input: {
    deckId: string;
    mode: SessionMode;
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale?: string | null;
    createdBy: string;
  }): Promise<Session> {
    const banque = await this.banks.findById(input.deckId);
    if (banque === null) throw new BankNotFoundError(input.deckId);

    // Boucle de réessai plutôt qu'un seul tirage : deux séances qui
    // partageraient un code enverraient deux classes voisines dans la même
    // partie. La collision est improbable, pas impossible.
    for (let essai = 0; essai < 10; essai += 1) {
      const joinCode = frapperUnCode();
      if ((await this.sessions.findByJoinCode(joinCode)) !== null) continue;
      return this.sessions.create({
        deckId: input.deckId,
        mode: input.mode,
        maxParticipants: input.maxParticipants,
        defaultTimeLimit: input.defaultTimeLimit,
        guestLocale: input.guestLocale ?? null,
        joinCode,
        createdBy: input.createdBy,
      });
    }
    throw new SessionNotFoundError('aucun code d entrée libre après dix essais');
  }

  async open(input: { sessionId: string }): Promise<void> {
    await this.transition(input.sessionId, 'ouverte');
  }

  /**
   * ⛔ LE FIGEMENT (D10). La banque est copiée sur la séance, délais déjà
   * résolus, et plus rien ne relira la question vivante ensuite.
   *
   * ⛔ Et c'est TOUT OU RIEN : on résout les délais de toutes les questions
   * avant d'écrire la moindre ligne. Une séance à moitié figée est le pire état
   * possible devant une classe, et refuser ici, avant que l'écran s'allume,
   * est tout l'intérêt du refus.
   */
  async start(input: { sessionId: string }): Promise<void> {
    const session = await this.require(input.sessionId);
    if (!peutPasserA(session.status, 'en-cours')) {
      throw new InvalidSessionTransitionError(session.status, 'en-cours');
    }

    const banque = await this.banks.findById(session.deckId);
    if (banque === null) throw new BankNotFoundError(session.deckId);
    if (banque.questions.length === 0) {
      throw new TimeLimitUnresolvableError(0, 'la banque ne contient aucune question');
    }

    const figees: Omit<FrozenQuestion, 'id'>[] = [];
    for (const question of banque.questions) {
      const delai = resoudreLeDelai({
        mode: session.mode,
        questionTimeLimit: question.timeLimit,
        sessionDefault: session.defaultTimeLimit,
      });
      if (delai.kind === 'refuse') {
        throw new TimeLimitUnresolvableError(question.rank, delai.raison);
      }
      figees.push({
        rank: question.rank,
        questionId: question.id,
        prompt: question.prompt,
        imageId: question.imageId,
        imageAlt: question.imageAlt,
        answerMode: question.answerMode,
        timeLimitResolved: delai.seconds,
        regles: question.regles,
        options: question.options,
        acceptedAnswers: question.acceptedAnswers,
        openedAt: null,
        deadlineAt: null,
        closedAt: null,
      });
    }

    await this.sessions.freezeQuestions(session.id, figees);
    await this.sessions.setStatus(session.id, 'en-cours');

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.session.started', {
        sessionId: session.id,
        deckId: session.deckId,
        mode: session.mode,
        questionCount: figees.length,
        participantCount: session.participants.length,
      });
    }
  }

  async rename(input: { participantId: string; name: string | null }): Promise<void> {
    // `null` est une valeur VOULUE et non une absence : c'est ainsi que
    // l'animatrice annule un renommage. Même décision que l'issue #29.
    const nettoye = input.name === null ? null : input.name.trim();
    await this.sessions.renameParticipant({
      participantId: input.participantId,
      name: nettoye === '' ? null : nettoye,
    });
  }

  async list(): Promise<readonly Session[]> {
    return this.sessions.list();
  }

  async findOne(input: { sessionId: string }): Promise<Session> {
    return this.require(input.sessionId);
  }

  private async transition(sessionId: string, vers: SessionStatus): Promise<void> {
    const session = await this.require(sessionId);
    if (!peutPasserA(session.status, vers)) {
      throw new InvalidSessionTransitionError(session.status, vers);
    }
    await this.sessions.setStatus(sessionId, vers);
  }

  private async require(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
```

⚠️ `newId` n'est pas utilisé ici : la frappe des identifiants vit dans
l'adaptateur. Si le lint signale un import inutile, **le retirer**.

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/manage-session.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 12 tests verts.

- [ ] **Step 5 : prouver le figement par mutation**

```bash
cp packages/module-quiz/src/application/manage-session.use-case.ts /tmp/ms.bak

echo "### M1 : le figement devient incremental au lieu de tout-ou-rien"
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/application/manage-session.use-case.ts';
let t=fs.readFileSync(f,'utf8');
t=t.replace('    await this.sessions.freezeQuestions(session.id, figees);','');
t=t.replace('      figees.push({','      await this.sessions.freezeQuestions(session.id, [{');
t=t.replace('        closedAt: null,\n      });','        closedAt: null,\n      }]);');
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/manage-session.use-case.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "ne fige rien du tout" /tmp/v1.log | head -2
cp /tmp/ms.bak packages/module-quiz/src/application/manage-session.use-case.ts

echo "### M2 : le refus de delai devient un repli sur 20 s"
sed -i "s|        throw new TimeLimitUnresolvableError(question.rank, delai.raison);|        figees.push({ rank: question.rank, questionId: question.id, prompt: question.prompt, imageId: question.imageId, imageAlt: question.imageAlt, answerMode: question.answerMode, timeLimitResolved: 20, regles: question.regles, options: question.options, acceptedAnswers: question.acceptedAnswers, openedAt: null, deadlineAt: null, closedAt: null }); continue;|" packages/module-quiz/src/application/manage-session.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/manage-session.use-case.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "aucun delai resoluble" /tmp/v2.log | head -2
cp /tmp/ms.bak packages/module-quiz/src/application/manage-session.use-case.ts

echo "### M3 : l unicite du code d entree n est plus verifiee"
sed -i "s|      if ((await this.sessions.findByJoinCode(joinCode)) !== null) continue;||" packages/module-quiz/src/application/manage-session.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/manage-session.use-case.spec.ts > /tmp/v3.log 2>&1; echo "CODE : $?"
cp /tmp/ms.bak packages/module-quiz/src/application/manage-session.use-case.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/manage-session.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 **CODE : 1** sur « ne fige rien du tout », M2 **CODE : 1** sur le
refus de délai.

⚠️ **M3 restera probablement VERTE** : quarante tirages sur un alphabet de 32
caractères à la puissance 8 ne collisionnent jamais en pratique, donc le test
« ne frappe pas deux fois le même code » ne garde pas la boucle de réessai, il
garde seulement que le code est aléatoire. C'est une limite **réelle** du test,
pas un faux positif : la noter, et ne pas prétendre que la boucle est prouvée.
Pour la prouver il faudrait injecter le générateur, ce qui vaut son propre test
si la collision devient un souci mesuré.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/application/manage-session.use-case.spec.ts
git commit -m "test(quiz): exiger un figement tout-ou-rien, et un refus avant la classe

D10. Vu rouge d abord.

Trois tests portent le coeur de la decision :

- une correction de la banque faite APRES le demarrage ne change rien a
  la seance en cours. C est la raison d etre du figement, et le test le
  prouve en modifiant la banque entre les deux appels.
- une question de defi sans delai ni defaut est REFUSEE au demarrage,
  donc avant que la classe regarde l ecran. Le decouvrir en jouant serait
  le pire moment.
- et le refus ne fige RIEN : une seance a moitie figee est le pire etat
  possible devant une classe.

En mode controle les delais figes sont nuls, et ce n est pas un refus :
D6 retire le minuteur de ce mode, donc WCAG 2.2.1 ne s y applique pas."
git add packages/module-quiz/src/application/manage-session.use-case.ts
git commit -m "feat(quiz): creer, ouvrir et demarrer une seance

Le demarrage resout TOUS les delais avant d ecrire la moindre ligne, puis
ecrit en une fois. Tout ou rien.

Le code d entree evite I, O, 0 et 1 : il est lu sur un videoprojecteur et
retape sur un telephone, et ces quatre-la se confondent. Meme
raisonnement que le joinCode du loto.

Verifie par mutation : rendre le figement incremental, ou transformer le
refus de delai en repli sur 20 s, font rougir.

⚠️ La boucle de reessai du code d entree n est PAS prouvee par un test,
quarante tirages sur 32^8 ne collisionnent jamais. Le test garde que le
code est aleatoire, pas que la boucle sert. Limite notee plutot que
maquillee."
```

---

## Task 10 : rejoindre une séance, et la retrouver après une coupure

**Files:**
- Create: `packages/module-quiz/src/application/join-session.use-case.ts`
- Test: `packages/module-quiz/src/application/join-session.use-case.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/application/join-session.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { SessionClosedToJoinError, SessionFullError, SessionNotFoundError } from '../domain/errors.js';
import { JoinSessionUseCase } from './join-session.use-case.js';
import { FakeSessionRepository, sessionOf } from './testing/fake-repositories.js';

function build() {
  const sessions = new FakeSessionRepository();
  const useCase = new JoinSessionUseCase(sessions);
  return { sessions, useCase };
}

describe('JoinSessionUseCase', () => {
  it('attribue un participant au premier invite', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

    const r = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(r.participantIndex).toBe(1);
  });

  it('attribue des participants differents a deux invites, en mode solo', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

    const a = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    const b = await useCase.execute({ sessionId: 'session-1', guestId: 'g-2', displayName: 'Bea' });

    expect(a.participantId).not.toBe(b.participantId);
    expect([a.participantIndex, b.participantIndex]).toEqual([1, 2]);
  });

  /**
   * ⛔ LA REGLE QUI SAUVE LA SEANCE. Spec §5.4 : « une reconnexion aboutit
   * toujours ». Un meme guestId doit retrouver SON participant, avec son score,
   * et surtout ne pas en consommer un second, sinon trois coupures wifi par
   * eleve epuisent le plafond en pleine seance.
   */
  it('rend le MEME participant a une reconnexion du meme invite', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

    const premiere = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    const seconde = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(seconde.participantId).toBe(premiere.participantId);
    expect((await sessions.findById('session-1'))?.participants).toHaveLength(1);
  });

  it('laisse entrer sur une seance DEJA en cours', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'en-cours', maxParticipants: 6, participants: [] }));

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).resolves.toMatchObject({ participantIndex: 1 });
  });

  it('refuse sur un brouillon', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'brouillon' }));

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionClosedToJoinError);
  });

  it('refuse sur une seance terminee', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'terminee' }));

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionClosedToJoinError);
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ sessionId: 'fantome', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionNotFoundError);
  });

  /**
   * ⛔ Le plafond est celui de la SEANCE (`maxParticipants`), distinct du
   * plafond d'invites du manifeste applique a /api/guest-token (issue #75). Les
   * deux existent et ne mesurent pas la meme chose : en mode equipes, dix
   * invites peuvent tenir dans trois participants.
   */
  it('refuse un participant de trop quand la seance est pleine', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 2, participants: [] }));

    await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ sessionId: 'session-1', guestId: 'g-2', displayName: 'Bea' });

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-3', displayName: 'Cal' })).rejects.toThrow(SessionFullError);
  });

  /**
   * ⛔ Et une RECONNEXION aboutit meme sur une seance pleine : l'eleve a deja
   * sa place, la lui refuser serait l'exclure pour une coupure reseau.
   */
  it('laisse revenir un invite deja present, meme seance pleine', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 1, participants: [] }));

    const premiere = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    const retour = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(retour.participantId).toBe(premiere.participantId);
  });

  it('prend le rang le plus haut plus un, et non le nombre de participants', async () => {
    const { useCase, sessions } = build();
    // Un trou de rang : ce que laisse un participant retire a la main.
    sessions.add(sessionOf({
      status: 'ouverte',
      maxParticipants: 6,
      participants: [
        { id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: [] },
        { id: 'p-7', participantIndex: 7, name: null, score: 0, memberNames: [] },
      ],
    }));

    const r = await useCase.execute({ sessionId: 'session-1', guestId: 'g-9', displayName: 'Dan' });

    expect(r.participantIndex, 'le plus haut plus un, jamais le compte').toBe(8);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/join-session.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './join-session.use-case.js'`.

- [ ] **Step 3 : écrire le cas d'usage**

`packages/module-quiz/src/application/join-session.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import {
  SessionClosedToJoinError,
  SessionFullError,
  SessionNotFoundError,
} from '../domain/errors.js';
import { peutRejoindre } from '../domain/session-status.js';
import type { SessionRepository } from '../domain/ports/session.repository.js';

export interface PlaceAttribuee {
  participantId: string;
  participantIndex: number;
  /** Vrai quand l'invité retrouve une place qu'il avait déjà. */
  retour: boolean;
}

@Injectable()
export class JoinSessionUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(input: {
    sessionId: string;
    guestId: string;
    displayName: string;
  }): Promise<PlaceAttribuee> {
    const session = await this.sessions.findById(input.sessionId);
    if (session === null) throw new SessionNotFoundError(input.sessionId);

    // ⛔ La reconnexion est cherchée AVANT le plafond : un élève qui a déjà sa
    // place doit la retrouver même sur une séance pleine. L'ordre inverse
    // l'exclurait pour une coupure réseau, sur un wifi d'établissement peu
    // fiable, le scénario de référence.
    const deja = await this.sessions.findParticipantByGuest({
      sessionId: session.id,
      guestId: input.guestId,
    });
    if (deja !== null) {
      await this.sessions.addMember({
        participantId: deja.id,
        guestId: input.guestId,
        displayName: input.displayName,
      });
      return { participantId: deja.id, participantIndex: deja.participantIndex, retour: true };
    }

    if (!peutRejoindre(session.status)) throw new SessionClosedToJoinError(session.status);
    if (session.participants.length >= session.maxParticipants) {
      throw new SessionFullError(session.maxParticipants);
    }

    // Le rang le plus haut plus un, et non le nombre de participants : les rangs
    // ont des trous après un retrait, et `@@unique([sessionId, participantIndex,
    // tenantId])` refuserait un doublon.
    const rang =
      session.participants.reduce((haut, p) => Math.max(haut, p.participantIndex), 0) + 1;

    const participant = await this.sessions.addParticipant({
      sessionId: session.id,
      participantIndex: rang,
    });
    await this.sessions.addMember({
      participantId: participant.id,
      guestId: input.guestId,
      displayName: input.displayName,
    });

    return { participantId: participant.id, participantIndex: rang, retour: false };
  }
}
```

⚠️ Ce cas d'usage ne crée **pas** d'équipes partagées : un invité égale un
participant. Le mode « équipes » se règle par `maxParticipants` plus petit que le
nombre d'élèves, auquel cas les surnuméraires sont refusés, ce qui n'est **pas**
le partage d'équipe du loto. Si Elda veut de vraies équipes partagées, c'est une
issue à ouvrir, pas un effet de bord à supposer livré.

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/join-session.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 10 tests verts.

- [ ] **Step 5 : prouver l'ordre des deux gardes par mutation**

C'est le point le plus important de la tâche : l'ordre « reconnexion avant
plafond » n'est visible dans aucune signature.

```bash
cp packages/module-quiz/src/application/join-session.use-case.ts /tmp/js.bak

echo "### M1 : le plafond passe AVANT la reconnexion"
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/application/join-session.use-case.ts';
let t=fs.readFileSync(f,'utf8');
const garde='    if (!peutRejoindre(session.status)) throw new SessionClosedToJoinError(session.status);\n    if (session.participants.length >= session.maxParticipants) {\n      throw new SessionFullError(session.maxParticipants);\n    }\n';
if(!t.includes(garde)){console.error('ancre introuvable');process.exit(1);}
t=t.replace(garde,'');
t=t.replace('    const deja = await this.sessions.findParticipantByGuest({', garde+'\n    const deja = await this.sessions.findParticipantByGuest({');
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/join-session.use-case.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "revenir un invite deja present" /tmp/v1.log | head -2
cp /tmp/js.bak packages/module-quiz/src/application/join-session.use-case.ts

echo "### M2 : le rang devient le nombre de participants"
sed -i "s|      session.participants.reduce((haut, p) => Math.max(haut, p.participantIndex), 0) + 1;|      session.participants.length + 1;|" packages/module-quiz/src/application/join-session.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/join-session.use-case.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "rang le plus haut" /tmp/v2.log | head -2
cp /tmp/js.bak packages/module-quiz/src/application/join-session.use-case.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/join-session.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 **CODE : 1** sur « laisse revenir un invite deja present, meme
seance pleine » ; M2 **CODE : 1** sur le test du rang. Puis **CODE : 0**.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/application/join-session.use-case.spec.ts
git commit -m "test(quiz): exiger qu une reconnexion aboutisse, meme seance pleine

Spec §5.4 : « une reconnexion aboutit toujours, meme session commencee :
sinon une coupure wifi exclut un eleve. » Vu rouge d abord.

Deux tests portent des decisions invisibles dans les signatures :

- un meme guestId retrouve SON participant et n en consomme pas un
  second. Sans ca, trois coupures par eleve epuisent le plafond en pleine
  seance, et le scenario de reference est un wifi d etablissement peu
  fiable.
- une reconnexion aboutit MEME sur une seance pleine. L eleve a deja sa
  place ; la lui refuser serait l exclure pour une coupure reseau.

Un troisieme garde le rang d attribution : le plus haut plus un, jamais
le compte, parce que les rangs ont des trous apres un retrait et que
@@unique refuserait un doublon."
git add packages/module-quiz/src/application/join-session.use-case.ts
git commit -m "feat(quiz): rejoindre une seance, et la retrouver apres une coupure

⛔ La reconnexion est cherchee AVANT le plafond, et l ordre est tout :
l inverse exclurait un eleve qui a deja sa place pour une coupure reseau.
Verifie par mutation, intervertir les deux gardes fait rougir.

⚠️ Ce cas d usage ne cree PAS d equipes partagees : un invite egale un
participant, et le mode equipes se regle par un maxParticipants plus
petit, ce qui refuse les surnumeraires au lieu de les regrouper. Ce n est
pas le partage d equipe du loto. De vraies equipes partagees sont une
issue a ouvrir, pas un effet de bord a supposer livre."
```

---

> **Suite.** Les tâches 11 à 20 sont dans
> [`2026-11-08-module-quiz-seance-5.md`](./2026-11-08-module-quiz-seance-5.md) :
> ouvrir et fermer une question, enregistrer une réponse, terminer la séance, le
> retour de séance, le contrôleur HTTP, la passerelle, les trois écrans avec le
> plancher d'accessibilité, l'e2e des deux modes et la vérification complète.
