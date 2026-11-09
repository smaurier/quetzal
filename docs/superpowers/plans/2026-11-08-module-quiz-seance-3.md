# Module Quiz, plan 2, suite : la séance (tâches 7 et 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Suite de** [`2026-11-08-module-quiz-seance-2.md`](./2026-11-08-module-quiz-seance-2.md). Les garde-fous du premier fichier restent en vigueur : base locale gardée dans le même appel, vérification **par paquet**, et **code de sortie explicite** plutôt qu'absence de lignes.

---

## Task 7 : le port de la séance et sa doublure

**Files:**
- Create: `packages/module-quiz/src/domain/ports/session.repository.ts`
- Modify: `packages/module-quiz/src/application/testing/fake-repositories.ts`

- [ ] **Step 1 : écrire le port**

`packages/module-quiz/src/domain/ports/session.repository.ts` :

```ts
import type { AnswerMode } from '../answer-mode.js';
import type { SessionMode } from '../session-mode.js';
import type { SessionStatus } from '../session-status.js';
import type { ReglesDeSaisie } from '../normalisation.js';
import type { QuestionOption } from './question-bank.repository.js';

/** La question figée. `Omit<QuestionOption, 'id'>` serait faux : l'écran élève a besoin d'identifiants stables pour désigner son choix. */
export interface FrozenQuestion {
  id: string;
  rank: number;
  questionId: string;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: AnswerMode;
  /** Le délai qui FAIT FOI (D10). `null` en mode contrôle. */
  timeLimitResolved: number | null;
  regles: ReglesDeSaisie;
  options: readonly QuestionOption[];
  acceptedAnswers: readonly string[];
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
}

export interface Participant {
  id: string;
  participantIndex: number;
  name: string | null;
  score: number;
  memberNames: readonly string[];
}

export interface Session {
  id: string;
  deckId: string;
  mode: SessionMode;
  status: SessionStatus;
  maxParticipants: number;
  joinCode: string;
  defaultTimeLimit: number | null;
  guestLocale: string | null;
  questions: readonly FrozenQuestion[];
  participants: readonly Participant[];
}

export interface NewAnswer {
  sessionQuestionId: string;
  participantId: string;
  authorGuestId: string;
  optionId: string | null;
  value: string | null;
  isCorrect: boolean;
  elapsedMs: number;
  points: number;
}

export interface AnswerRow extends NewAnswer {
  id: string;
}

export interface SessionRepository {
  create(input: {
    deckId: string;
    mode: SessionMode;
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale: string | null;
    joinCode: string;
    createdBy: string;
  }): Promise<Session>;

  findById(sessionId: string): Promise<Session | null>;
  findByJoinCode(joinCode: string): Promise<Session | null>;
  list(): Promise<readonly Session[]>;

  setStatus(sessionId: string, status: SessionStatus): Promise<void>;

  /** Écrit les questions figées, en une fois : un figement partiel serait une séance à moitié jouable. */
  freezeQuestions(sessionId: string, questions: readonly Omit<FrozenQuestion, 'id'>[]): Promise<void>;

  openQuestion(input: {
    sessionQuestionId: string;
    openedAt: Date;
    deadlineAt: Date | null;
  }): Promise<void>;
  closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void>;

  addParticipant(input: {
    sessionId: string;
    participantIndex: number;
  }): Promise<Participant>;
  /** Idempotent : une reconnexion ne doit pas créer un second membre. */
  addMember(input: {
    participantId: string;
    guestId: string;
    displayName: string;
  }): Promise<void>;
  findParticipantByGuest(input: {
    sessionId: string;
    guestId: string;
  }): Promise<Participant | null>;
  renameParticipant(input: { participantId: string; name: string | null }): Promise<void>;

  /** Rend `null` quand le participant a déjà répondu : l'unicité vit en base. */
  recordAnswer(answer: NewAnswer): Promise<AnswerRow | null>;
  addToScore(input: { participantId: string; points: number }): Promise<void>;
  answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]>;
  allAnswers(sessionId: string): Promise<readonly AnswerRow[]>;
}
```

⚠️ `recordAnswer` rend `null` plutôt que de lever : l'unicité est garantie par
`@@unique([sessionQuestionId, participantId, tenantId])`, donc c'est l'adaptateur
qui sait traduire la violation, et le cas d'usage décide quoi en faire.

- [ ] **Step 2 : étendre la doublure du plan 1**

Ajouter à `packages/module-quiz/src/application/testing/fake-repositories.ts` :

```ts
import type {
  AnswerRow,
  FrozenQuestion,
  NewAnswer,
  Participant,
  Session,
  SessionRepository,
} from '../../domain/ports/session.repository.js';
import type { SessionStatus } from '../../domain/session-status.js';

export function frozenQuestionOf(
  rank: number,
  overrides: Partial<FrozenQuestion> = {}): FrozenQuestion {
  return {
    id: nextId('sq'),
    rank,
    questionId: nextId('q'),
    prompt: `Question ${rank}`,
    imageId: null,
    imageAlt: null,
    answerMode: 'choix',
    timeLimitResolved: 20,
    regles: { accentsSensibles: true, casseSensible: false },
    options: [
      { id: `o-juste-${rank}`, rank: 1, label: 'Juste', imageId: null, imageAlt: null, isCorrect: true },
      { id: `o-faux-${rank}`, rank: 2, label: 'Faux', imageId: null, imageAlt: null, isCorrect: false },
    ],
    acceptedAnswers: [],
    openedAt: null,
    deadlineAt: null,
    closedAt: null...overrides,
  };
}

export function sessionOf(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    deckId: 'bank-1',
    mode: 'defi',
    status: 'ouverte',
    maxParticipants: 6,
    joinCode: 'ABCD1234',
    defaultTimeLimit: 20,
    guestLocale: null,
    questions: [frozenQuestionOf(1), frozenQuestionOf(2)],
    participants: []...overrides,
  };
}

/**
 * Doublure écrite à la main (CLAUDE.md §11 interdit `vi.mock`). Elle porte une
 * décision qui compte : `recordAnswer` applique vraiment l'unicité par
 * `(question, participant)`, comme la contrainte en base. Sans ça, les tests de
 * cas d'usage passeraient sur une doublure plus permissive que la production.
 */
export class FakeSessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();
  readonly answers: AnswerRow[] = [];

  add(session: Session): void {
    this.sessions.set(session.id, session);
  }

  private muter(sessionId: string, patch: (session: Session) => Session): void {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) this.sessions.set(sessionId, patch(session));
  }

  private questionById(sessionQuestionId: string): { session: Session; question: FrozenQuestion } | null {
    for (const session of this.sessions.values()) {
      const question = session.questions.find((candidate) => candidate.id === sessionQuestionId);
      if (question !== undefined) return { session, question };
    }
    return null;
  }

  async create(input: {
    deckId: string;
    mode: Session['mode'];
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale: string | null;
    joinCode: string;
    createdBy: string;
  }): Promise<Session> {
    const session = sessionOf({
      id: nextId('session'),
      deckId: input.deckId,
      mode: input.mode,
      status: 'brouillon',
      maxParticipants: input.maxParticipants,
      defaultTimeLimit: input.defaultTimeLimit,
      guestLocale: input.guestLocale,
      joinCode: input.joinCode,
      questions: [],
      participants: [],
    });
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByJoinCode(joinCode: string): Promise<Session | null> {
    return [...this.sessions.values()].find((s) => s.joinCode === joinCode) ?? null;
  }

  async list(): Promise<readonly Session[]> {
    return [...this.sessions.values()];
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    this.muter(sessionId, (session) => ({ ...session, status }));
  }

  async freezeQuestions(
    sessionId: string,
    questions: readonly Omit<FrozenQuestion, 'id'>[]): Promise<void> {
    this.muter(sessionId, (session) => ({
      ...session,
      questions: questions.map((q) => ({ ...q, id: nextId('sq') })),
    }));
  }

  async openQuestion(input: {
    sessionQuestionId: string;
    openedAt: Date;
    deadlineAt: Date | null;
  }): Promise<void> {
    const trouve = this.questionById(input.sessionQuestionId);
    if (trouve === null) return;
    this.muter(trouve.session.id, (session) => ({
      ...session,
      questions: session.questions.map((q) =>
        q.id === input.sessionQuestionId
          ? { ...q, openedAt: input.openedAt, deadlineAt: input.deadlineAt }
          : q),
    }));
  }

  async closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void> {
    const trouve = this.questionById(input.sessionQuestionId);
    if (trouve === null) return;
    this.muter(trouve.session.id, (session) => ({
      ...session,
      questions: session.questions.map((q) =>
        q.id === input.sessionQuestionId ? { ...q, closedAt: input.closedAt } : q),
    }));
  }

  async addParticipant(input: { sessionId: string; participantIndex: number }): Promise<Participant> {
    const participant: Participant = {
      id: nextId('participant'),
      participantIndex: input.participantIndex,
      name: null,
      score: 0,
      memberNames: [],
    };
    this.muter(input.sessionId, (session) => ({
      ...session,
      participants: [...session.participants, participant],
    }));
    return participant;
  }

  private readonly membres = new Map<string, Set<string>>();

  async addMember(input: {
    participantId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    const deja = this.membres.get(input.participantId) ?? new Set<string>();
    // Idempotent : une reconnexion ne doit pas creer un second membre.
    deja.add(input.guestId);
    this.membres.set(input.participantId, deja);

    for (const session of this.sessions.values()) {
      if (!session.participants.some((p) => p.id === input.participantId)) continue;
      this.muter(session.id, (courante) => ({
        ...courante,
        participants: courante.participants.map((p) =>
          p.id === input.participantId
            ? {
                ...p,
                memberNames: p.memberNames.includes(input.displayName)
                  ? p.memberNames
                  : [...p.memberNames, input.displayName],
              }
            : p),
      }));
      return;
    }
  }

  async findParticipantByGuest(input: {
    sessionId: string;
    guestId: string;
  }): Promise<Participant | null> {
    const session = this.sessions.get(input.sessionId);
    if (session === undefined) return null;
    for (const participant of session.participants) {
      if (this.membres.get(participant.id)?.has(input.guestId) === true) return participant;
    }
    return null;
  }

  async renameParticipant(input: { participantId: string; name: string | null }): Promise<void> {
    for (const session of this.sessions.values()) {
      if (!session.participants.some((p) => p.id === input.participantId)) continue;
      this.muter(session.id, (courante) => ({
        ...courante,
        participants: courante.participants.map((p) =>
          p.id === input.participantId ? { ...p, name: input.name } : p),
      }));
      return;
    }
  }

  async recordAnswer(answer: NewAnswer): Promise<AnswerRow | null> {
    // ⛔ L'unicite est appliquee ICI aussi, parce que la base l'applique. Une
    // doublure plus permissive que la production ferait passer des tests de cas
    // d'usage qui echoueraient en vrai.
    const deja = this.answers.some(
      (a) =>
        a.sessionQuestionId === answer.sessionQuestionId &&
        a.participantId === answer.participantId);
    if (deja) return null;

    const ligne: AnswerRow = { ...answer, id: nextId('answer') };
    this.answers.push(ligne);
    return ligne;
  }

  async addToScore(input: { participantId: string; points: number }): Promise<void> {
    for (const session of this.sessions.values()) {
      if (!session.participants.some((p) => p.id === input.participantId)) continue;
      this.muter(session.id, (courante) => ({
        ...courante,
        participants: courante.participants.map((p) =>
          p.id === input.participantId ? { ...p, score: p.score + input.points } : p),
      }));
      return;
    }
  }

  async answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]> {
    return this.answers.filter((a) => a.sessionQuestionId === sessionQuestionId);
  }

  async allAnswers(sessionId: string): Promise<readonly AnswerRow[]> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return [];
    const ids = new Set(session.questions.map((q) => q.id));
    return this.answers.filter((a) => ids.has(a.sessionQuestionId));
  }
}
```

⚠️ `QuestionOption` gagne un `imageAlt` : la tâche 14 du plan 1 l'a ajouté au
port de la banque. Si le typecheck signale la propriété manquante, c'est que le
plan 1 n'a pas été exécuté jusqu'au bout.

- [ ] **Step 3 : vérifier que ça compile, puis commit**

```bash
node node_modules/typescript/bin/tsc --noEmit --project packages/module-quiz/tsconfig.typecheck.json > /tmp/t.log 2>&1; echo "CODE : $?"
grep -m3 "error TS" /tmp/t.log
```

Expected: **CODE : 0**.

```bash
git add packages/module-quiz/src/domain/ports/session.repository.ts packages/module-quiz/src/application/testing/fake-repositories.ts
git commit -m "feat(quiz): le port de la seance et sa doublure

Un Port dans Domain, une doublure ecrite a la main dans Application :
CLAUDE.md §11 interdit vi.mock.

⛔ La doublure applique VRAIMENT l unicite par (question, participant),
comme la contrainte en base. Une doublure plus permissive que la
production ferait passer des tests de cas d usage qui echoueraient en
vrai, et c est exactement le genre de faux vert que ce depot traque.

recordAnswer rend null plutot que de lever : l unicite est garantie par
@@unique, donc c est l adaptateur qui sait traduire la violation, et le
cas d usage decide quoi en faire.

addMember est idempotent, parce qu une reconnexion ne doit pas creer un
second membre, et le scenario de reference est un wifi peu fiable."
```

---

## Task 8 : l'adaptateur Prisma de la séance

**Files:**
- Create: `packages/module-quiz/src/infrastructure/prisma-session.repository.ts`
- Test: `packages/module-quiz/src/infrastructure/prisma-session.repository.integration.spec.ts`

⚠️ Premier adaptateur de ce Port, donc **TDD contre un vrai Postgres**
(`CLAUDE.md` §5 et §11).

- [ ] **Step 1 : écrire le test d'intégration qui échoue**

`packages/module-quiz/src/infrastructure/prisma-session.repository.integration.spec.ts` :

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaSessionRepository } from './prisma-session.repository.js';
import type { FrozenQuestion } from '../domain/ports/session.repository.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const FIGEE: Omit<FrozenQuestion, 'id'> = {
  rank: 1,
  questionId: 'q-origine',
  prompt: '¿Cómo se dice « chaise » ?',
  imageId: null,
  imageAlt: null,
  answerMode: 'choix',
  timeLimitResolved: 20,
  regles: { accentsSensibles: true, casseSensible: false },
  options: [
    { id: 'o-1', rank: 1, label: 'la silla', imageId: null, imageAlt: null, isCorrect: true },
    { id: 'o-2', rank: 2, label: 'la mesa', imageId: null, imageAlt: null, isCorrect: false },
  ],
  acceptedAnswers: [],
  openedAt: null,
  deadlineAt: null,
  closedAt: null,
};

describe('PrismaSessionRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  async function unJeu(tenantId: string, ownerId: string): Promise<string> {
    // La séance a besoin d'une banque existante : la clé étrangère de
    // Quiz_Session vers Quiz_Deck la rend obligatoire.
    const { PrismaQuestionBankRepository } = await import('./prisma-question-bank.repository.js');
    const banques = new PrismaQuestionBankRepository();
    const banque = await inTenant(tenantId, ownerId, () =>
      banques.create({ name: 'Vocabulaire', isTemplate: false, createdBy: ownerId, questions: [] }));
    return banque.id;
  }

  it('cree une seance et la relit par son code d entree', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId,
        mode: 'defi',
        maxParticipants: 6,
        defaultTimeLimit: 20,
        guestLocale: null,
        joinCode: 'ABCD1234',
        createdBy: ownerId,
      }));

    const relue = await inTenant(tenantId, ownerId, () => repo.findByJoinCode('ABCD1234'));
    expect(relue?.id).toBe(creee.id);
    expect(relue?.status, 'une seance nait en brouillon').toBe('brouillon');
  });

  /**
   * ⛔ Le figement est le coeur de D10. Les options et les reponses acceptees
   * sont ecrites en JSON : on verifie qu'elles reviennent INTACTES, parce qu'un
   * JSON mal relu ne se voit qu'en seance.
   */
  it('fige une question et la relit avec ses propositions intactes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'FIGE0001', createdBy: ownerId,
      }));

    await inTenant(tenantId, ownerId, () => repo.freezeQuestions(session.id, [FIGEE]));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(session.id));

    expect(relue?.questions).toHaveLength(1);
    expect(relue?.questions[0]?.timeLimitResolved).toBe(20);
    expect(relue?.questions[0]?.options).toEqual(FIGEE.options);
  });

  it('rend les questions figees dans l ordre de leur rang', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'ORDRE001', createdBy: ownerId,
      }));

    // Inserees a l'envers, exprès : un ORDER BY absent rendrait cet ordre.
    await inTenant(tenantId, ownerId, () =>
      repo.freezeQuestions(session.id, [
        { ...FIGEE, rank: 3, prompt: 'troisieme' },
        { ...FIGEE, rank: 1, prompt: 'premiere' },
        { ...FIGEE, rank: 2, prompt: 'deuxieme' },
      ]));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(session.id));

    expect(relue?.questions.map((q) => q.prompt)).toEqual([
      'premiere', 'deuxieme', 'troisieme',
    ]);
  });

  /**
   * ⛔ LE TEST QUI COMPTE LE PLUS. L'unicite d'une reponse par question et par
   * participant vit en base (@@unique). L'adaptateur doit traduire la violation
   * en `null`, et NON la laisser remonter en 500 : deux doigts sur un telephone
   * d'eleve suffisent a declencher deux emissions.
   */
  it('refuse une seconde reponse du meme participant, en rendant null', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'UNIQ0001', createdBy: ownerId,
      }));
    await inTenant(tenantId, ownerId, () => repo.freezeQuestions(session.id, [FIGEE]));
    const avecQuestions = await inTenant(tenantId, ownerId, () => repo.findById(session.id));
    const sqId = avecQuestions!.questions[0]!.id;
    const participant = await inTenant(tenantId, ownerId, () =>
      repo.addParticipant({ sessionId: session.id, participantIndex: 1 }));

    const base = {
      sessionQuestionId: sqId,
      participantId: participant.id,
      authorGuestId: 'g-1',
      optionId: 'o-1',
      value: null,
      isCorrect: true,
      elapsedMs: 1200,
      points: 1200,
    };

    const premiere = await inTenant(tenantId, ownerId, () => repo.recordAnswer(base));
    const seconde = await inTenant(tenantId, ownerId, () => repo.recordAnswer(base));

    expect(premiere).not.toBeNull();
    expect(seconde, 'la seconde est refusee, pas une exception').toBeNull();
    expect(await inTenant(tenantId, ownerId, () => repo.answersFor(sqId))).toHaveLength(1);
  });

  it('retrouve le participant d un invite, pour qu une reconnexion le retrouve', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'controle', maxParticipants: 6, defaultTimeLimit: null,
        guestLocale: null, joinCode: 'RECO0001', createdBy: ownerId,
      }));
    const participant = await inTenant(tenantId, ownerId, () =>
      repo.addParticipant({ sessionId: session.id, participantIndex: 1 }));

    await inTenant(tenantId, ownerId, () =>
      repo.addMember({ participantId: participant.id, guestId: 'g-7', displayName: 'Ana' }));
    // Deux fois : une reconnexion ne doit pas creer un second membre.
    await inTenant(tenantId, ownerId, () =>
      repo.addMember({ participantId: participant.id, guestId: 'g-7', displayName: 'Ana' }));

    const retrouve = await inTenant(tenantId, ownerId, () =>
      repo.findParticipantByGuest({ sessionId: session.id, guestId: 'g-7' }));
    expect(retrouve?.id).toBe(participant.id);
    expect(retrouve?.memberNames, 'un seul membre, pas deux').toEqual(['Ana']);
  });

  it('cloisonne les seances entre locataires', async () => {
    const voisin = await seedTenant();
    const chezNous = await seedTenant();
    const deckId = await unJeu(voisin.tenantId, voisin.ownerId);
    const repo = new PrismaSessionRepository();
    const sienne = await inTenant(voisin.tenantId, voisin.ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'VOISIN01', createdBy: voisin.ownerId,
      }));

    expect(
      await inTenant(chezNous.tenantId, chezNous.ownerId, () => repo.findById(sienne.id)),
      'une seance d un autre locataire doit etre introuvable').toBeNull();
    expect(
      await inTenant(chezNous.tenantId, chezNous.ownerId, () => repo.findByJoinCode('VOISIN01')),
      'et son code d entree ne doit pas la trouver non plus').toBeNull();
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-quiz exec vitest run --config vitest.integration.config.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './prisma-session.repository.js'`.

- [ ] **Step 3 : écrire l'adaptateur**

`packages/module-quiz/src/infrastructure/prisma-session.repository.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import { isAnswerMode } from '../domain/answer-mode.js';
import { isSessionMode } from '../domain/session-mode.js';
import { isSessionStatus } from '../domain/session-status.js';
import { InvalidQuestionShapeError, SessionNotFoundError } from '../domain/errors.js';
import type { QuestionOption } from '../domain/ports/question-bank.repository.js';
import type {
  AnswerRow,
  FrozenQuestion,
  NewAnswer,
  Participant,
  Session,
  SessionRepository,
} from '../domain/ports/session.repository.js';
import type { SessionStatus } from '../domain/session-status.js';

/** La violation d'unicité de Prisma. Pas une panne : un geste répété. */
const VIOLATION_UNICITE = 'P2002';

interface LigneMembre { guestId: string; displayName: string }
interface LigneParticipant {
  id: string; participantIndex: number; name: string | null; score: number;
  members: LigneMembre[];
}
interface LigneQuestion {
  id: string; rank: number; questionId: string; prompt: string;
  imageId: string | null; imageAlt: string | null; answerMode: string;
  timeLimitResolved: number | null;
  accentsSensibles: boolean; casseSensible: boolean;
  options: unknown; acceptedAnswers: unknown;
  openedAt: Date | null; deadlineAt: Date | null; closedAt: Date | null;
}
interface LigneSession {
  id: string; deckId: string; mode: string; status: string;
  maxParticipants: number; joinCode: string;
  defaultTimeLimit: number | null; guestLocale: string | null;
  questions: LigneQuestion[]; participants: LigneParticipant[];
}

/**
 * ⛔ `findFirst` et les variantes `*Many`, jamais `findUnique` ni `update` :
 * les tables ont une clé composite `@@id([id, tenantId])` et l'extension de
 * cloisonnement fusionne `tenantId` à plat dans les `*Many`. Même raison que
 * dans les dépôts du loto.
 */
@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  private get prisma() {
    return getTenantScopedPrisma() as unknown as {
      quiz_Session: {
        findMany(args?: unknown): Promise<LigneSession[]>;
        findFirst(args: unknown): Promise<LigneSession | null>;
        create(args: unknown): Promise<{ id: string }>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_SessionQuestion: {
        createMany(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_Participant: {
        findFirst(args: unknown): Promise<LigneParticipant | null>;
        createMany(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_Member: { createMany(args: unknown): Promise<unknown> };
      quiz_Answer: {
        create(args: unknown): Promise<AnswerRow>;
        findMany(args: unknown): Promise<AnswerRow[]>;
      };
    };
  }

  /**
   * Les propositions figées sont relues d'un `Json`, donc `unknown`. Narrowé
   * sans `as` (CLAUDE.md §14) : une ligne mal formée en base ne doit pas
   * devenir une question injouable en silence.
   */
  private lireOptions(valeur: unknown): readonly QuestionOption[] {
    if (!Array.isArray(valeur)) return [];
    const options: QuestionOption[] = [];
    for (const brut of valeur) {
      if (typeof brut !== 'object' || brut === null) continue;
      if (!('id' in brut) || typeof brut.id !== 'string') continue;
      if (!('rank' in brut) || typeof brut.rank !== 'number') continue;
      options.push({
        id: brut.id,
        rank: brut.rank,
        label: 'label' in brut && typeof brut.label === 'string' ? brut.label : null,
        imageId: 'imageId' in brut && typeof brut.imageId === 'string' ? brut.imageId : null,
        imageAlt: 'imageAlt' in brut && typeof brut.imageAlt === 'string' ? brut.imageAlt : null,
        isCorrect: 'isCorrect' in brut && brut.isCorrect === true,
      });
    }
    return options.sort((a, b) => a.rank - b.rank);
  }

  private lireChaines(valeur: unknown): readonly string[] {
    if (!Array.isArray(valeur)) return [];
    return valeur.filter((v): v is string => typeof v === 'string');
  }

  private toQuestion(ligne: LigneQuestion): FrozenQuestion {
    if (!isAnswerMode(ligne.answerMode)) {
      throw new InvalidQuestionShapeError('choix', `mode inconnu en base : ${ligne.answerMode}`);
    }
    return {
      id: ligne.id,
      rank: ligne.rank,
      questionId: ligne.questionId,
      prompt: ligne.prompt,
      imageId: ligne.imageId,
      imageAlt: ligne.imageAlt,
      answerMode: ligne.answerMode,
      timeLimitResolved: ligne.timeLimitResolved,
      regles: {
        accentsSensibles: ligne.accentsSensibles,
        casseSensible: ligne.casseSensible,
      },
      options: this.lireOptions(ligne.options),
      acceptedAnswers: this.lireChaines(ligne.acceptedAnswers),
      openedAt: ligne.openedAt,
      deadlineAt: ligne.deadlineAt,
      closedAt: ligne.closedAt,
    };
  }

  private toParticipant(ligne: LigneParticipant): Participant {
    return {
      id: ligne.id,
      participantIndex: ligne.participantIndex,
      name: ligne.name,
      score: ligne.score,
      memberNames: ligne.members.map((m) => m.displayName),
    };
  }

  private toSession(ligne: LigneSession): Session {
    if (!isSessionMode(ligne.mode)) {
      throw new SessionNotFoundError(`${ligne.id} (mode inconnu : ${ligne.mode})`);
    }
    if (!isSessionStatus(ligne.status)) {
      throw new SessionNotFoundError(`${ligne.id} (statut inconnu : ${ligne.status})`);
    }
    return {
      id: ligne.id,
      deckId: ligne.deckId,
      mode: ligne.mode,
      status: ligne.status,
      maxParticipants: ligne.maxParticipants,
      joinCode: ligne.joinCode,
      defaultTimeLimit: ligne.defaultTimeLimit,
      guestLocale: ligne.guestLocale,
      // Trié par rang ici, et non laissé à l'ordre de la base : sans ORDER BY,
      // l'ordre n'est pas garanti, et une séance jouerait ses questions dans le
      // désordre une fois sur deux.
      questions: [...ligne.questions]
        .sort((a, b) => a.rank - b.rank)
        .map((q) => this.toQuestion(q)),
      participants: [...ligne.participants]
        .sort((a, b) => a.participantIndex - b.participantIndex)
        .map((p) => this.toParticipant(p)),
    };
  }

  private get inclusion() {
    return {
      questions: { orderBy: { rank: 'asc' as const } },
      participants: {
        orderBy: { participantIndex: 'asc' as const },
        include: { members: true },
      },
    };
  }

  async create(input: {
    deckId: string;
    mode: Session['mode'];
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale: string | null;
    joinCode: string;
    createdBy: string;
  }): Promise<Session> {
    const id = newId();
    await this.prisma.quiz_Session.create({
      data: {
        id,
        deckId: input.deckId,
        mode: input.mode,
        status: 'brouillon',
        maxParticipants: input.maxParticipants,
        defaultTimeLimit: input.defaultTimeLimit,
        guestLocale: input.guestLocale,
        joinCode: input.joinCode,
        createdBy: input.createdBy,
      },
    });
    const relue = await this.findById(id);
    // Jamais un cast sur un `null` : introuvable juste après création signale un
    // cloisonnement mal posé, ce qu'un cast masquerait.
    if (relue === null) throw new SessionNotFoundError(id);
    return relue;
  }

  async findById(sessionId: string): Promise<Session | null> {
    const ligne = await this.prisma.quiz_Session.findFirst({
      where: { id: sessionId },
      include: this.inclusion,
    });
    return ligne === null ? null : this.toSession(ligne);
  }

  async findByJoinCode(joinCode: string): Promise<Session | null> {
    const ligne = await this.prisma.quiz_Session.findFirst({
      where: { joinCode },
      include: this.inclusion,
    });
    return ligne === null ? null : this.toSession(ligne);
  }

  async list(): Promise<readonly Session[]> {
    const lignes = await this.prisma.quiz_Session.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.inclusion,
    });
    return lignes.map((ligne) => this.toSession(ligne));
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const horodatage =
      status === 'en-cours' ? { startedAt: new Date() }
      : status === 'terminee' ? { finishedAt: new Date() }
      : {};
    await this.prisma.quiz_Session.updateMany({
      where: { id: sessionId },
      data: { status...horodatage },
    });
  }

  async freezeQuestions(
    sessionId: string,
    questions: readonly Omit<FrozenQuestion, 'id'>[]): Promise<void> {
    if (questions.length === 0) return;
    // `createMany` en une fois : un figement partiel serait une séance à moitié
    // jouable, et c'est le pire état possible devant une classe.
    await this.prisma.quiz_SessionQuestion.createMany({
      data: questions.map((q) => ({
        id: newId(),
        sessionId,
        rank: q.rank,
        questionId: q.questionId,
        prompt: q.prompt,
        imageId: q.imageId,
        imageAlt: q.imageAlt,
        answerMode: q.answerMode,
        timeLimitResolved: q.timeLimitResolved,
        accentsSensibles: q.regles.accentsSensibles,
        casseSensible: q.regles.casseSensible,
        options: q.options,
        acceptedAnswers: q.acceptedAnswers,
      })),
    });
  }

  async openQuestion(input: {
    sessionQuestionId: string;
    openedAt: Date;
    deadlineAt: Date | null;
  }): Promise<void> {
    await this.prisma.quiz_SessionQuestion.updateMany({
      where: { id: input.sessionQuestionId },
      data: { openedAt: input.openedAt, deadlineAt: input.deadlineAt },
    });
  }

  async closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void> {
    await this.prisma.quiz_SessionQuestion.updateMany({
      where: { id: input.sessionQuestionId },
      data: { closedAt: input.closedAt },
    });
  }

  async addParticipant(input: {
    sessionId: string;
    participantIndex: number;
  }): Promise<Participant> {
    const id = newId();
    await this.prisma.quiz_Participant.createMany({
      data: [{ id, sessionId: input.sessionId, participantIndex: input.participantIndex }],
    });
    return {
      id,
      participantIndex: input.participantIndex,
      name: null,
      score: 0,
      memberNames: [],
    };
  }

  async addMember(input: {
    participantId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    try {
      await this.prisma.quiz_Member.createMany({
        data: [{
          id: newId(),
          participantId: input.participantId,
          guestId: input.guestId,
          displayName: input.displayName,
        }],
      });
    } catch (err) {
      // Idempotent : `@@unique([participantId, guestId, tenantId])` refuse le
      // doublon, et une reconnexion n'est pas une erreur.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === VIOLATION_UNICITE) {
        return;
      }
      throw err;
    }
  }

  async findParticipantByGuest(input: {
    sessionId: string;
    guestId: string;
  }): Promise<Participant | null> {
    const ligne = await this.prisma.quiz_Participant.findFirst({
      where: { sessionId: input.sessionId, members: { some: { guestId: input.guestId } } },
      include: { members: true },
    });
    return ligne === null ? null : this.toParticipant(ligne);
  }

  async renameParticipant(input: { participantId: string; name: string | null }): Promise<void> {
    await this.prisma.quiz_Participant.updateMany({
      where: { id: input.participantId },
      data: { name: input.name },
    });
  }

  async recordAnswer(answer: NewAnswer): Promise<AnswerRow | null> {
    try {
      return await this.prisma.quiz_Answer.create({ data: { id: newId()...answer } });
    } catch (err) {
      // ⛔ Rendu `null` et NON laissé remonter : deux doigts sur un téléphone
      // d'élève suffisent à déclencher deux émissions, et un 500 sur un
      // double-appui serait un défaut de produit.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === VIOLATION_UNICITE) {
        return null;
      }
      throw err;
    }
  }

  async addToScore(input: { participantId: string; points: number }): Promise<void> {
    await this.prisma.quiz_Participant.updateMany({
      where: { id: input.participantId },
      data: { score: { increment: input.points } },
    });
  }

  async answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]> {
    return this.prisma.quiz_Answer.findMany({ where: { sessionQuestionId } });
  }

  async allAnswers(sessionId: string): Promise<readonly AnswerRow[]> {
    return this.prisma.quiz_Answer.findMany({
      where: { sessionQuestion: { sessionId } },
      orderBy: { answeredAt: 'asc' },
    });
  }
}
```

⚠️ `score: { increment: … }` plutôt qu'une lecture suivie d'une écriture : en
mode défi, soixante réponses arrivent dans la même seconde, et un
read-modify-write en perdrait. C'est la base qui doit incrémenter.

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-quiz exec vitest run --config vitest.integration.config.ts --reporter=verbose > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "✓|×" /tmp/v.log | head -20
```

Expected: **CODE : 0**, les 6 tests de ce fichier nommés et verts, plus ceux du
plan 1.

- [ ] **Step 5 : prouver les deux gardes qui comptent, par mutation**

```bash
cp packages/module-quiz/src/infrastructure/prisma-session.repository.ts /tmp/ps.bak
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac

echo "### M1 : la violation d unicite remonte au lieu de rendre null"
sed -i "s|        return null;|        throw err;|" packages/module-quiz/src/infrastructure/prisma-session.repository.ts
pnpm --filter @quetzal/module-quiz exec vitest run --config vitest.integration.config.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "seconde reponse" /tmp/v1.log | head -2
cp /tmp/ps.bak packages/module-quiz/src/infrastructure/prisma-session.repository.ts

echo "### M2 : le tri par rang disparait"
sed -i "s|      questions: \[...ligne.questions\]\n        .sort((a, b) => a.rank - b.rank)|      questions: ligne.questions|" packages/module-quiz/src/infrastructure/prisma-session.repository.ts
node -e "
const fs=require('node:fs');const f='packages/module-quiz/src/infrastructure/prisma-session.repository.ts';
let t=fs.readFileSync(f,'utf8');
t=t.replace('[...ligne.questions]\n        .sort((a, b) => a.rank - b.rank)\n        .map((q) => this.toQuestion(q))','ligne.questions.map((q) => this.toQuestion(q))');
fs.writeFileSync(f,t,'utf8');console.log('mutation posee');
"
pnpm --filter @quetzal/module-quiz exec vitest run --config vitest.integration.config.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
cp /tmp/ps.bak packages/module-quiz/src/infrastructure/prisma-session.repository.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run --config vitest.integration.config.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 **CODE : 1** sur « refuse une seconde reponse ».

⚠️ **M2 restera peut-être VERTE**, parce que l'`orderBy` de l'inclusion rend déjà
les lignes triées et que le `.sort()` du code est une ceinture par-dessus une
bretelle. Si elle est verte, ce n'est pas un faux positif à ignorer : c'est que le
test ne garde que l'`orderBy`. **Retirer alors l'`orderBy` de `this.inclusion`
aussi** et refaire la mutation, si le test rougit, les deux gardes sont prouvés
ensemble ; s'il reste vert, la base rendait le bon ordre par hasard et le test est
trop faible.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/infrastructure/prisma-session.repository.integration.spec.ts
git commit -m "test(quiz): exiger l adaptateur Prisma de la seance, contre un vrai Postgres

Premier adaptateur de ce Port, donc TDD (CLAUDE.md §5), et jamais de mock
de Prisma (§11).

Le test qui compte le plus garde l unicite d une reponse par question et
par participant : l adaptateur doit traduire la violation en null et NON
la laisser remonter en 500. Deux doigts sur un telephone d eleve
suffisent a declencher deux emissions.

Trois autres gardent des pieges : les propositions figees reviennent
INTACTES d un JSON, les questions sortent dans l ordre de leur RANG et
non dans celui de la base, et une reconnexion ne cree pas un second
membre."
git add packages/module-quiz/src/infrastructure/prisma-session.repository.ts
git commit -m "feat(quiz): l adaptateur Prisma de la seance

findFirst et *Many, jamais findUnique ni update : cle composite et
extension de cloisonnement qui fusionne tenantId a plat.

Le JSON des propositions figees est narrowe SANS as (§14) : une ligne mal
formee en base ne doit pas devenir une question injouable en silence.

score: { increment } plutot qu une lecture suivie d une ecriture : en
mode defi soixante reponses arrivent dans la meme seconde, et un
read-modify-write en perdrait. C est la base qui incremente.

freezeQuestions ecrit en UNE fois : un figement partiel serait une seance
a moitie jouable, le pire etat possible devant une classe."
```

---

> **Suite.** Les tâches 9 à 20 sont dans
> [`2026-11-08-module-quiz-seance-4.md`](./2026-11-08-module-quiz-seance-4.md) :
> les huit cas d'usage, le contrôleur HTTP, la passerelle, les trois écrans avec
> le plancher d'accessibilité, l'e2e des deux modes, et la vérification complète.
>
> À la fin de cette tâche, la persistance est entière et testée contre un vrai
> Postgres. Rien de ce qui suit ne la modifie.
