# Module Quiz — plan 2, suite : la séance (tâches 13 à 16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Suite de** [`2026-11-08-module-quiz-seance-5.md`](./2026-11-08-module-quiz-seance-5.md). Garde-fous du premier fichier toujours en vigueur.

---

## Task 13 : terminer la séance, et le retour de séance

**Files:**
- Create: `packages/module-quiz/src/application/finish-session.use-case.ts`
- Create: `packages/module-quiz/src/application/session-report.use-case.ts`
- Test: `packages/module-quiz/src/application/session-report.use-case.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/application/session-report.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { FinishSessionUseCase } from './finish-session.use-case.js';
import { SessionReportUseCase } from './session-report.use-case.js';
import { FakeSessionRepository, frozenQuestionOf, sessionOf } from './testing/fake-repositories.js';

const T0 = 1_700_000_000_000;

async function seanceJouee() {
  const sessions = new FakeSessionRepository();
  const q1 = frozenQuestionOf(1, { prompt: 'Chaise ?', openedAt: new Date(T0), closedAt: new Date(T0 + 20_000) });
  const q2 = frozenQuestionOf(2, { prompt: 'Table ?', openedAt: new Date(T0 + 30_000), closedAt: new Date(T0 + 50_000) });
  sessions.add(sessionOf({
    status: 'en-cours',
    questions: [q1, q2],
    participants: [
      { id: 'p-1', participantIndex: 1, name: 'Les lynx', score: 2200, memberNames: ['Ana'] },
      { id: 'p-2', participantIndex: 2, name: null, score: 1000, memberNames: ['Bea', 'Cal'] },
      { id: 'p-3', participantIndex: 3, name: null, score: 0, memberNames: ['Dan'] },
    ],
  }));

  // p-1 : juste aux deux. p-2 : juste a la premiere, absente a la seconde.
  // p-3 : fausse a la premiere, absente a la seconde.
  await sessions.recordAnswer({ sessionQuestionId: q1.id, participantId: 'p-1', authorGuestId: 'g-1', optionId: 'o-juste-1', value: null, isCorrect: true, elapsedMs: 1200, points: 1200 });
  await sessions.recordAnswer({ sessionQuestionId: q2.id, participantId: 'p-1', authorGuestId: 'g-1', optionId: 'o-juste-2', value: null, isCorrect: true, elapsedMs: 1000, points: 1000 });
  await sessions.recordAnswer({ sessionQuestionId: q1.id, participantId: 'p-2', authorGuestId: 'g-2', optionId: 'o-juste-1', value: null, isCorrect: true, elapsedMs: 9000, points: 1000 });
  await sessions.recordAnswer({ sessionQuestionId: q1.id, participantId: 'p-3', authorGuestId: 'g-4', optionId: 'o-faux-1', value: null, isCorrect: false, elapsedMs: 4000, points: 0 });

  return { sessions, q1, q2 };
}

describe('FinishSessionUseCase', () => {
  it('termine une seance en cours', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new FinishSessionUseCase(sessions);

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });

  it('refuse de terminer deux fois', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new FinishSessionUseCase(sessions);

    await useCase.execute({ sessionId: 'session-1' });

    await expect(useCase.execute({ sessionId: 'session-1' })).rejects.toThrow();
  });

  it('termine aussi une seance ouverte mais jamais commencee', async () => {
    const sessions = new FakeSessionRepository();
    sessions.add(sessionOf({ status: 'ouverte', questions: [] }));
    const useCase = new FinishSessionUseCase(sessions);

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });
});

describe('SessionReportUseCase', () => {
  /**
   * D12 : le retour vit DANS le module, sans port et sans capacite de
   * plateforme, parce que le retour du loto n'a pas la meme forme — il n'a
   * aucune bonne reponse par eleve. Fabriquer une abstraction au-dessus de deux
   * choses qui ne se ressemblent pas est exactement ce que #28 evite.
   */
  it('classe les participants par score decroissant', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement.map((l) => l.participantId)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  /**
   * ⛔ Ce que la spec §1 appelle le vrai manque de la plateforme : savoir
   * QUELLE QUESTION a echoue. C'est ce qui fait revenir une enseignante, plus
   * qu'un module de plus.
   */
  it('rend le taux de reussite par question, pour dire laquelle a echoue', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]).toMatchObject({
      rank: 1, prompt: 'Chaise ?', answerCount: 3, correctCount: 2,
    });
    expect(rapport.questions[1]).toMatchObject({
      rank: 2, prompt: 'Table ?', answerCount: 1, correctCount: 1,
    });
  });

  /**
   * ⛔ UNE ABSENCE N'EST PAS UNE ERREUR, et c'est la distinction qui compte le
   * plus dans ce rapport. Un eleve dont le telephone a lache n'a pas « rate »
   * la question : le confondre avec une faute donnerait a Elda un diagnostic
   * faux, et sur le seul ecran qu'elle regarde apres la seance.
   */
  it('distingue une absence de reponse d une reponse fausse', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    const p2 = rapport.classement.find((l) => l.participantId === 'p-2');
    expect(p2).toMatchObject({ correctCount: 1, wrongCount: 0, missingCount: 1 });

    const p3 = rapport.classement.find((l) => l.participantId === 'p-3');
    expect(p3).toMatchObject({ correctCount: 0, wrongCount: 1, missingCount: 1 });
  });

  it('nomme le participant par son nom choisi, et derive les autres', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement[0]?.label).toBe('Les lynx');
    // Membre unique : son nom. Plusieurs membres : le numero.
    expect(rapport.classement.find((l) => l.participantId === 'p-3')?.label).toBe('Dan');
    expect(rapport.classement.find((l) => l.participantId === 'p-2')?.label).toBe('2');
  });

  /**
   * ⛔ L'AUTEUR de chaque reponse est rendu, meme en mode equipes (D4) : c'est
   * ce qui permet un retour nominatif sans exclure du jeu l'eleve sans
   * telephone.
   */
  it('rend l auteur de chaque reponse', async () => {
    const { sessions } = await seanceJouee();
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]?.answers.map((a) => a.authorGuestId).sort()).toEqual([
      'g-1', 'g-2', 'g-4',
    ]);
  });

  it('rend un rapport lisible sur une seance ou personne n a repondu', async () => {
    const sessions = new FakeSessionRepository();
    sessions.add(sessionOf({
      status: 'terminee',
      questions: [frozenQuestionOf(1)],
      participants: [{ id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] }],
    }));
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]?.answerCount).toBe(0);
    expect(rapport.classement[0]?.missingCount).toBe(1);
    // Aucune division par zero dans un taux : c'est l'ecran qui le formate.
    expect(rapport.questions[0]?.correctCount).toBe(0);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/session-report.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './finish-session.use-case.js'`.

- [ ] **Step 3 : écrire la fin de séance**

`packages/module-quiz/src/application/finish-session.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import { InvalidSessionTransitionError, SessionNotFoundError } from '../domain/errors.js';
import { peutPasserA } from '../domain/session-status.js';
import type { SessionRepository } from '../domain/ports/session.repository.js';

@Injectable()
export class FinishSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly eventBus?: EventBus,
  ) {}

  async execute(input: { sessionId: string }): Promise<void> {
    const session = await this.sessions.findById(input.sessionId);
    if (session === null) throw new SessionNotFoundError(input.sessionId);
    if (!peutPasserA(session.status, 'terminee')) {
      throw new InvalidSessionTransitionError(session.status, 'terminee');
    }

    await this.sessions.setStatus(session.id, 'terminee');

    // Le meneur, ou `null` quand personne n'a marqué un point : afficher un
    // vainqueur à zéro sur le dernier écran que voit la classe serait faux.
    const meneur = [...session.participants]
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.session.finished', {
        sessionId: session.id,
        questionCount: session.questions.length,
        participantCount: session.participants.length,
        topParticipantId: meneur?.id ?? null,
      });
    }
  }
}
```

- [ ] **Step 4 : écrire le retour de séance**

`packages/module-quiz/src/application/session-report.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { SessionNotFoundError } from '../domain/errors.js';
import type { AnswerRow, Participant, SessionRepository } from '../domain/ports/session.repository.js';

export interface LigneDeClassement {
  participantId: string;
  label: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  /** ⛔ Distinct de `wrongCount` : une absence n'est pas une erreur. */
  missingCount: number;
}

export interface ReponseDuRapport {
  participantId: string;
  authorGuestId: string;
  isCorrect: boolean;
  elapsedMs: number;
  points: number;
}

export interface QuestionDuRapport {
  sessionQuestionId: string;
  rank: number;
  prompt: string;
  answerCount: number;
  correctCount: number;
  answers: readonly ReponseDuRapport[];
}

export interface RapportDeSeance {
  sessionId: string;
  mode: string;
  questionCount: number;
  participantCount: number;
  questions: readonly QuestionDuRapport[];
  classement: readonly LigneDeClassement[];
}

/**
 * Le nom d'affichage d'un participant. Un nom choisi gagne ; sinon un membre
 * unique prête le sien, et au-delà c'est le numéro.
 *
 * Même décision que `teamNameFor` du loto (issue #29) : `null` est le cas
 * normal, pas un cas dégradé.
 */
export function labelDuParticipant(participant: Participant): string {
  const choisi = participant.name?.trim();
  if (choisi !== undefined && choisi !== '') return choisi;
  if (participant.memberNames.length === 1) return participant.memberNames[0] ?? '';
  return String(participant.participantIndex);
}

/**
 * D12 : le retour vit DANS le module, sans port et sans capacité de plateforme.
 * Le retour du loto n'a pas la même forme — il n'a aucune bonne réponse par
 * élève — et fabriquer une abstraction au-dessus de deux choses qui ne se
 * ressemblent pas est exactement ce que #28 évite en attendant un vrai second
 * consommateur.
 */
@Injectable()
export class SessionReportUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(input: { sessionId: string }): Promise<RapportDeSeance> {
    const session = await this.sessions.findById(input.sessionId);
    if (session === null) throw new SessionNotFoundError(input.sessionId);

    const toutes = await this.sessions.allAnswers(session.id);
    const parQuestion = new Map<string, AnswerRow[]>();
    for (const reponse of toutes) {
      const liste = parQuestion.get(reponse.sessionQuestionId) ?? [];
      liste.push(reponse);
      parQuestion.set(reponse.sessionQuestionId, liste);
    }

    // Seules les questions JOUEES comptent : une question figée mais jamais
    // ouverte n'a pas « échoué », et la compter ferait baisser tous les taux.
    const jouees = session.questions.filter((q) => q.openedAt !== null);

    const questions: QuestionDuRapport[] = jouees.map((question) => {
      const reponses = parQuestion.get(question.id) ?? [];
      return {
        sessionQuestionId: question.id,
        rank: question.rank,
        prompt: question.prompt,
        answerCount: reponses.length,
        correctCount: reponses.filter((r) => r.isCorrect).length,
        answers: reponses.map((r) => ({
          participantId: r.participantId,
          authorGuestId: r.authorGuestId,
          isCorrect: r.isCorrect,
          elapsedMs: r.elapsedMs,
          points: r.points,
        })),
      };
    });

    const classement: LigneDeClassement[] = session.participants
      .map((participant) => {
        const siennes = toutes.filter((r) => r.participantId === participant.id);
        const correctCount = siennes.filter((r) => r.isCorrect).length;
        const wrongCount = siennes.length - correctCount;
        return {
          participantId: participant.id,
          label: labelDuParticipant(participant),
          score: participant.score,
          correctCount,
          wrongCount,
          // ⛔ Une ABSENCE, et non une erreur : un élève dont le téléphone a
          // lâché n'a pas raté la question. Les confondre donnerait à Elda un
          // diagnostic faux, sur le seul écran qu'elle regarde après la séance.
          missingCount: jouees.length - siennes.length,
        };
      })
      // Score décroissant, puis réponses justes, puis label : un classement qui
      // change d'ordre à chaque rechargement se lit mal sur un vidéoprojecteur.
      .sort((a, b) =>
        b.score - a.score || b.correctCount - a.correctCount || a.label.localeCompare(b.label),
      );

    return {
      sessionId: session.id,
      mode: session.mode,
      questionCount: jouees.length,
      participantCount: session.participants.length,
      questions,
      classement,
    };
  }
}
```

- [ ] **Step 5 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/application/session-report.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 10 tests verts.

- [ ] **Step 6 : prouver les deux gardes du rapport**

```bash
cp packages/module-quiz/src/application/session-report.use-case.ts /tmp/sr.bak

echo "### M1 : une absence est comptee comme une erreur"
sed -i "s|          missingCount: jouees.length - siennes.length,|          missingCount: 0,|" packages/module-quiz/src/application/session-report.use-case.ts
sed -i "s|        const wrongCount = siennes.length - correctCount;|        const wrongCount = jouees.length - correctCount;|" packages/module-quiz/src/application/session-report.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/session-report.use-case.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "distingue une absence" /tmp/v1.log | head -2
cp /tmp/sr.bak packages/module-quiz/src/application/session-report.use-case.ts

echo "### M2 : les questions jamais ouvertes entrent dans le rapport"
sed -i "s|    const jouees = session.questions.filter((q) => q.openedAt !== null);|    const jouees = session.questions;|" packages/module-quiz/src/application/session-report.use-case.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/application/session-report.use-case.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
cp /tmp/sr.bak packages/module-quiz/src/application/session-report.use-case.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/application/session-report.use-case.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 **CODE : 1** sur « distingue une absence ».

⚠️ **M2 peut rester VERTE** : dans la séance de test, les deux questions sont
ouvertes, donc le filtre ne retire rien. Si elle est verte, **ajouter un
troisième test** avec une question figée jamais ouverte, et vérifier qu'elle
n'apparaît pas dans le rapport et ne gonfle pas `missingCount`. Un garde qu'on
n'a pas vu rougir ne garde rien.

- [ ] **Step 7 : commit, en deux**

```bash
git add packages/module-quiz/src/application/session-report.use-case.spec.ts
git commit -m "test(quiz): exiger qu une absence ne soit pas comptee comme une erreur

D12, et spec §1 qui nomme le retour de seance comme le vrai manque de la
plateforme. Vu rouge d abord.

⛔ Le test qui compte le plus distingue une ABSENCE d une reponse FAUSSE.
Un eleve dont le telephone a lache n a pas « rate » la question : les
confondre donnerait a Elda un diagnostic faux, et sur le seul ecran
qu elle regarde apres la seance.

Deux autres gardent ce qui fait la valeur du retour : le taux de reussite
PAR QUESTION, pour dire laquelle a echoue ; et l AUTEUR de chaque
reponse, qui rend le retour nominatif meme en mode equipes (D4) sans
exclure du jeu l eleve sans telephone."
git add packages/module-quiz/src/application/finish-session.use-case.ts packages/module-quiz/src/application/session-report.use-case.ts
git commit -m "feat(quiz): terminer une seance, et rendre son retour

Le retour vit DANS le module, sans port (D12) : le retour du loto n a pas
la meme forme, il n a aucune bonne reponse par eleve, et fabriquer une
abstraction au-dessus de deux choses qui ne se ressemblent pas est
exactement ce que #28 evite en attendant un vrai second consommateur.

Seules les questions JOUEES entrent dans le rapport : une question figee
mais jamais ouverte n a pas echoue, et la compter ferait baisser tous les
taux.

Le meneur est null quand personne n a marque un point : afficher un
vainqueur a zero sur le dernier ecran que voit la classe serait faux.

Le classement est trie par score, puis justes, puis label : un ordre qui
change a chaque rechargement se lit mal sur un videoprojecteur.

Verifie par mutation : compter une absence comme une erreur fait rougir."
```

---

## Task 14 : les commandes HTTP, et leur déclaration au manifeste

**Files:**
- Modify: `packages/module-quiz/src/presentation/dto/quiz.dto.ts`
- Create: `packages/module-quiz/src/presentation/session.controller.ts`
- Modify: `packages/module-quiz/src/manifest.ts`

- [ ] **Step 1 : étendre les schémas Zod**

Ajouter à `packages/module-quiz/src/presentation/dto/quiz.dto.ts` :

```ts
import { SESSION_MODES } from '../../domain/session-mode.js';
import { TIME_LIMIT_MAX, TIME_LIMIT_MIN } from '../../domain/time-limit.js';

export const createSessionSchema = z
  .object({
    deckId: z.string().min(1),
    mode: z.enum(SESSION_MODES),
    // Le même plafond que la CHECK en base et que le manifeste : 60, mesuré.
    maxParticipants: z.number().int().min(1).max(60),
    defaultTimeLimit: z.number().int().min(TIME_LIMIT_MIN).max(TIME_LIMIT_MAX).nullable(),
    guestLocale: z.string().min(2).max(5).nullable().optional(),
  })
  // ⛔ Refusé ICI plutôt qu'au démarrage, quand c'est déjà évitable : une séance
  // de défi sans défaut de session ne pourra démarrer que si CHAQUE question
  // porte son propre délai. Le dire à la création épargne un refus devant la
  // classe — et le refus du démarrage reste, parce que la banque peut changer
  // entre les deux.
  .refine((v) => v.mode === 'controle' || v.defaultTimeLimit !== null, {
    message: 'un défi demande un délai par défaut, sauf si chaque question porte le sien',
    path: ['defaultTimeLimit'],
  });

export const renameParticipantSchema = z.object({
  name: z.string().trim().max(40).nullable(),
});

export type CreateSessionBody = z.infer<typeof createSessionSchema>;
export type RenameParticipantBody = z.infer<typeof renameParticipantSchema>;
```

⚠️ Le `.refine` est une **aide**, pas la garde : il refuse le cas évitable à la
création, et le refus du démarrage (tâche 9) reste indispensable parce que la
banque peut perdre un délai entre les deux.

- [ ] **Step 2 : écrire le contrôleur**

`packages/module-quiz/src/presentation/session.controller.ts` :

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { FinishSessionUseCase } from '../application/finish-session.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import { QuizBroadcaster } from './quiz.broadcaster.js';
import { createSessionSchema, renameParticipantSchema } from './dto/quiz.dto.js';

/**
 * D9 : les commandes passent en HTTP, et la diffusion en WebSocket. Le
 * contrôleur exécute, le diffuseur prévient la salle — une commande mérite un
 * code de retour, un WebSocket ne sert qu'à diffuser.
 */
@Controller('api/modules/quiz/sessions')
export class SessionController {
  // Jetons explicites : sans eux, la métadonnée de type que Nest utiliserait
  // n'existe pas sous le transform esbuild de Vitest, et les dépendances
  // resteraient à undefined. Même raison que chez le loto.
  constructor(
    @Inject(ManageSessionUseCase) private readonly sessions: ManageSessionUseCase,
    @Inject(RunQuestionUseCase) private readonly questions: RunQuestionUseCase,
    @Inject(FinishSessionUseCase) private readonly finish: FinishSessionUseCase,
    @Inject(SessionReportUseCase) private readonly report: SessionReportUseCase,
    @Inject(QuizBroadcaster) private readonly broadcaster: QuizBroadcaster,
  ) {}

  @Get()
  async list() {
    return { sessions: await this.sessions.list() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.sessions.findOne({ sessionId: id });
  }

  @Get(':id/report')
  async getReport(@Param('id') id: string) {
    return this.report.execute({ sessionId: id });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    return this.sessions.create({
      deckId: parsed.data.deckId,
      mode: parsed.data.mode,
      maxParticipants: parsed.data.maxParticipants,
      defaultTimeLimit: parsed.data.defaultTimeLimit,
      guestLocale: parsed.data.guestLocale ?? null,
      createdBy: userId,
    });
  }

  @Post(':id/open')
  async open(@Param('id') id: string) {
    await this.sessions.open({ sessionId: id });
    await this.broadcaster.sessionChanged(id);
    return { ok: true };
  }

  @Post(':id/start')
  async start(@Param('id') id: string) {
    await this.sessions.start({ sessionId: id });
    await this.broadcaster.sessionChanged(id);
    return { ok: true };
  }

  @Post(':id/questions/next')
  async next(@Param('id') id: string) {
    const ouverte = await this.questions.openNext({ sessionId: id });
    // La diffusion part APRÈS l'écriture : un élève qui recevrait la question
    // avant qu'elle soit ouverte en base verrait sa réponse refusée.
    await this.broadcaster.questionOpened(id, ouverte);
    return { rank: ouverte.rank, deadlineAt: ouverte.deadlineAt };
  }

  @Post(':id/questions/close')
  async close(@Param('id') id: string) {
    const resultat = await this.questions.close({ sessionId: id });
    await this.broadcaster.questionClosed(id, resultat);
    return resultat;
  }

  @Post(':id/finish')
  async finishSession(@Param('id') id: string) {
    await this.finish.execute({ sessionId: id });
    await this.broadcaster.sessionFinished(id);
    return { ok: true };
  }

  @Patch(':id/participants/:participantId')
  async renameParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
  ) {
    const parsed = renameParticipantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.sessions.rename({ participantId, name: parsed.data.name });
    await this.broadcaster.sessionChanged(id);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    // Terminer, et non supprimer : une séance jouée porte un retour qu'Elda
    // peut vouloir relire. La suppression serait une autre décision.
    await this.finish.execute({ sessionId: id });
    return { ok: true };
  }
}
```

- [ ] **Step 3 : déclarer les routes et l'accès invité au manifeste**

Dans `packages/module-quiz/src/manifest.ts`, ajouter à `permissions` :

```ts
    'http:GET /api/modules/quiz/sessions': ['owner', 'creator'],
    'http:GET /api/modules/quiz/sessions/:id': ['owner', 'creator'],
    'http:GET /api/modules/quiz/sessions/:id/report': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/open': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/start': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/questions/next': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/questions/close': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/finish': ['owner', 'creator'],
    'http:PATCH /api/modules/quiz/sessions/:id/participants/:participantId': ['owner', 'creator'],
    'http:DELETE /api/modules/quiz/sessions/:id': ['owner', 'creator'],
    'ws:answer': ['guest', 'learner'],
```

et, à côté de `prismaModels`, l'accès invité :

```ts
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    /**
     * 60, le même nombre que `maxParticipants` en base et que le plafond mesuré
     * du loto (#32 : soixante téléphones tenus, 2129 ms d'entrée, 215 ms de
     * diffusion).
     *
     * ⚠️ Et il est VRAIMENT appliqué depuis l'issue #75 (PR #78), à
     * `POST /api/guest-token`, comparé au nombre d'invités PRÉSENTS. La spec § 7
     * avertit qu'il est décoratif : cet avertissement n'est plus vrai.
     */
    maxConcurrentPerSession: 60,
  },
  eventsPublished: [
    'quiz.session.started',
    'quiz.question.opened',
    'quiz.answer.recorded',
    'quiz.question.closed',
    'quiz.session.finished',
  ],
```

Et déclarer l'écran d'entrée dans `client.ts` :

```ts
  guestJoinComponent: () => import('./presentation/ui/guest-play.js'),
```

⚠️ `ws:answer` est le **seul** message entrant du module. Le test de contrat de
la tâche 4 du plan 1 vérifie que chaque route de contrôleur figure dans
`permissions` ; il échouera si une seule manque.

- [ ] **Step 4 : vérifier le contrat, et le prouver par mutation**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run tests/manifest.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"

cp packages/module-quiz/src/manifest.ts /tmp/man.bak
sed -i "/http:POST \/api\/modules\/quiz\/sessions\/:id\/start'/d" packages/module-quiz/src/manifest.ts
pnpm --filter @quetzal/module-quiz exec vitest run tests/manifest.spec.ts > /tmp/v1.log 2>&1; echo "CODE mutation : $?"
cp /tmp/man.bak packages/module-quiz/src/manifest.ts
pnpm --filter @quetzal/module-quiz exec vitest run tests/manifest.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: **CODE : 0**, puis **CODE mutation : 1**, puis **CODE : 0**.

- [ ] **Step 5 : commit**

```bash
git add packages/module-quiz/src/presentation/dto/quiz.dto.ts packages/module-quiz/src/presentation/session.controller.ts packages/module-quiz/src/manifest.ts packages/module-quiz/src/client.ts
git commit -m "feat(quiz): les commandes HTTP de la seance, declarees au manifeste

D9 : les commandes en HTTP, la diffusion en WebSocket. Onze routes
reservees a owner/creator, et ws:answer comme SEUL message entrant du
module.

La diffusion part APRES l ecriture : un eleve qui recevrait la question
avant qu elle soit ouverte en base verrait sa reponse refusee.

DELETE termine au lieu de supprimer : une seance jouee porte un retour qu
Elda peut vouloir relire, et la supprimer serait une autre decision.

Le .refine du schema de creation est une AIDE et non la garde : il refuse
un defi sans delai par defaut quand c est deja evitable, mais le refus du
demarrage reste indispensable parce que la banque peut perdre un delai
entre les deux.

⚠️ maxConcurrentPerSession vaut 60, le meme nombre que maxParticipants en
base, et il est VRAIMENT applique depuis #78. L avertissement de la spec
§7 qui le dit decoratif n est plus vrai.

Verifie par mutation : retirer une route du manifeste fait rougir le test
de contrat."
```

---

## Task 15 : la passerelle et le diffuseur

**Files:**
- Create: `packages/module-quiz/src/presentation/quiz.broadcaster.ts`
- Create: `packages/module-quiz/src/presentation/quiz.gateway.ts`
- Modify: `packages/module-quiz/src/quiz.module.ts`

- [ ] **Step 1 : écrire le diffuseur**

`packages/module-quiz/src/presentation/quiz.broadcaster.ts` :

```ts
import { Inject, Injectable } from '@nestjs/common';
import { logger, rooms } from '@quetzal/core';
import type { Server } from 'socket.io';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import type { FermetureResultat } from '../application/run-question.use-case.js';
import type { FrozenQuestion } from '../domain/ports/session.repository.js';

@Injectable()
export class QuizBroadcaster {
  private server: Server | null = null;

  constructor(
    @Inject(ManageSessionUseCase) private readonly sessions: ManageSessionUseCase,
    @Inject(SessionReportUseCase) private readonly report: SessionReportUseCase,
  ) {}

  attach(server: Server): void {
    this.server = server;
  }

  /**
   * Le seul point d'émission, et il n'est pas muet. Issue #34 du loto : un `?.`
   * avalait l'émission sans rien dire quand le serveur manquait.
   *
   * On ne lève pas pour autant : la commande HTTP est déjà exécutée et
   * persistée quand la diffusion part, donc échouer ici rendrait un 500 sur une
   * opération réussie. Une trace, pas une panne.
   */
  private emit(room: string, event: string, payload: unknown): void {
    if (this.server === null) {
      logger.error(
        { module: 'quiz', action: 'broadcast.detached', event, room },
        'quiz: diffusion demandée avant attachement du serveur',
      );
      return;
    }
    this.server.to(room).emit(event, payload);
  }

  private room(sessionId: string): string {
    return rooms.session('quiz', sessionId);
  }

  async sessionChanged(sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({ sessionId });
    // ⛔ Les propositions et les réponses acceptées ne partent PAS ici : la
    // vue de salle contient `isCorrect`, et l'envoyer à un élève lui donnerait
    // la réponse. L'écran élève reçoit sa propre charge, taillée.
    this.emit(this.room(sessionId), 'session-changed', {
      id: session.id,
      status: session.status,
      mode: session.mode,
      joinCode: session.joinCode,
      questionCount: session.questions.length,
      participants: session.participants.map((p) => ({
        id: p.id,
        participantIndex: p.participantIndex,
        name: p.name,
        score: p.score,
        memberNames: p.memberNames,
      })),
    });
  }

  /**
   * ⛔ LA CHARGE LA PLUS DANGEREUSE DU MODULE. Elle part vers les téléphones des
   * élèves, donc elle ne doit porter NI `isCorrect`, NI `acceptedAnswers`.
   * Les envoyer mettrait la réponse dans le code source de la page, où un élève
   * curieux la lirait en trois gestes.
   */
  async questionOpened(sessionId: string, question: FrozenQuestion): Promise<void> {
    this.emit(this.room(sessionId), 'question-opened', {
      sessionQuestionId: question.id,
      rank: question.rank,
      prompt: question.prompt,
      imageId: question.imageId,
      imageAlt: question.imageAlt,
      answerMode: question.answerMode,
      timeLimitResolved: question.timeLimitResolved,
      deadlineAt: question.deadlineAt?.toISOString() ?? null,
      options: question.options.map((option) => ({
        id: option.id,
        rank: option.rank,
        label: option.label,
        imageId: option.imageId,
        imageAlt: option.imageAlt,
      })),
    });
  }

  async questionClosed(sessionId: string, resultat: FermetureResultat): Promise<void> {
    this.emit(this.room(sessionId), 'question-closed', resultat);
    // Les scores ont bougé : la salle se remet à jour en une émission.
    await this.sessionChanged(sessionId);
  }

  async sessionFinished(sessionId: string): Promise<void> {
    const rapport = await this.report.execute({ sessionId });
    // Le classement part à tout le monde : c'est le podium. Les réponses
    // nominatives n'y sont pas, elles restent sur l'écran de l'animatrice.
    this.emit(this.room(sessionId), 'session-finished', {
      classement: rapport.classement,
      questionCount: rapport.questionCount,
    });
  }

  answerAcknowledged(
    sessionId: string,
    participantId: string,
    payload: { isCorrect: boolean; points: number; dansLaGrace: boolean },
  ): void {
    // Vers le seul participant : lui dire juste ou faux pendant que les autres
    // répondent encore ne doit pas fuiter dans la salle.
    this.emit(rooms.subgroup('quiz', sessionId, participantId), 'answer-result', payload);
  }
}
```

- [ ] **Step 2 : écrire la passerelle**

`packages/module-quiz/src/presentation/quiz.gateway.ts` :

```ts
import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { logger, rooms } from '@quetzal/core';
import type { Server, Socket } from 'socket.io';
import { AnswerQuestionUseCase } from '../application/answer-question.use-case.js';
import { JoinSessionUseCase } from '../application/join-session.use-case.js';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { QuizBroadcaster } from './quiz.broadcaster.js';

interface SocketData {
  role?: string;
  guestId?: string;
  displayName?: string;
  sessionId?: string;
  participantId?: string;
}

// CORS et authentification du handshake appartiennent à l'adaptateur de la
// plateforme, jamais au module.
@WebSocketGateway({ namespace: 'ws/quiz' })
export class QuizGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(JoinSessionUseCase) private readonly join: JoinSessionUseCase,
    @Inject(AnswerQuestionUseCase) private readonly answer: AnswerQuestionUseCase,
    @Inject(RunQuestionUseCase) private readonly questions: RunQuestionUseCase,
    @Inject(ManageSessionUseCase) private readonly sessions: ManageSessionUseCase,
    @Inject(QuizBroadcaster) private readonly broadcaster: QuizBroadcaster,
  ) {}

  // `afterInit` et non `handleConnection` : issue #34 du loto, toute diffusion
  // antérieure à la première connexion partait sinon dans le vide, sans erreur.
  afterInit(server: Server): void {
    this.broadcaster.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const data = client.data as SocketData;

    // Un invité tient son identifiant de séance de son JETON : il ne peut pas
    // en viser une autre. Une animatrice le passe en query, et le cloisonnement
    // par locataire fait le reste.
    const sessionId =
      data.role === 'guest' ? data.sessionId : queryValue(client.handshake.query['sessionId']);
    if (sessionId === undefined) {
      client.disconnect(true);
      return;
    }
    data.sessionId = sessionId;

    try {
      if (data.role === 'guest' && data.guestId !== undefined) {
        const place = await this.join.execute({
          sessionId,
          guestId: data.guestId,
          displayName: data.displayName ?? 'Invité',
        });
        data.participantId = place.participantId;
        await client.join(rooms.subgroup('quiz', sessionId, place.participantId));
      }

      await client.join(rooms.session('quiz', sessionId));

      const session = await this.sessions.findOne({ sessionId });
      const courante = await this.questions.current({ sessionId });

      // ⛔ L'état initial est TAILLÉ pour le destinataire. Un invité ne reçoit
      // jamais `isCorrect` ni `acceptedAnswers` : les envoyer mettrait la
      // réponse dans la page.
      client.emit('state', {
        session: {
          id: session.id,
          status: session.status,
          mode: session.mode,
          questionCount: session.questions.length,
          participants: session.participants,
        },
        participantId: data.participantId ?? null,
        question:
          courante === null
            ? null
            : {
                sessionQuestionId: courante.id,
                rank: courante.rank,
                prompt: courante.prompt,
                imageId: courante.imageId,
                imageAlt: courante.imageAlt,
                answerMode: courante.answerMode,
                timeLimitResolved: courante.timeLimitResolved,
                deadlineAt: courante.deadlineAt?.toISOString() ?? null,
                options: courante.options.map((o) => ({
                  id: o.id, rank: o.rank, label: o.label, imageId: o.imageId, imageAlt: o.imageAlt,
                })),
              },
      });

      if (data.participantId !== undefined) await this.broadcaster.sessionChanged(sessionId);
    } catch (err) {
      logger.warn({ err, sessionId }, 'quiz: connexion refusée');
      // Le NOM de la classe d'erreur, que l'écran traduit : jamais le message
      // technique, qui finirait affiché à un élève de collège.
      client.emit('join-failed', { reason: (err as Error).name });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('answer')
  async handleAnswer(
    @MessageBody() body: { optionId?: string; value?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const data = client.data as SocketData;
    if (data.sessionId === undefined || data.participantId === undefined) return;
    if (data.guestId === undefined) return;

    try {
      const r = await this.answer.execute({
        sessionId: data.sessionId,
        participantId: data.participantId,
        guestId: data.guestId,
        ...(body.optionId === undefined ? {} : { optionId: body.optionId }),
        ...(body.value === undefined ? {} : { value: body.value }),
      });
      // Diffusé vers le seul participant, jamais retourné : Nest transformerait
      // un retour {event, data} en événement, et le résultat irait à la salle.
      this.broadcaster.answerAcknowledged(data.sessionId, data.participantId, {
        isCorrect: r.isCorrect,
        points: r.points,
        dansLaGrace: r.dansLaGrace,
      });
    } catch (err) {
      // Un refus d'échéance ou un double appui n'est PAS une panne : l'élève
      // doit le lire, pas voir sa page casser.
      this.broadcaster.answerRefused(data.sessionId, data.participantId, (err as Error).name);
    }
  }
}

function queryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
```

Et ajouter au diffuseur la méthode que la passerelle appelle :

```ts
  answerRefused(sessionId: string, participantId: string, reason: string): void {
    this.emit(rooms.subgroup('quiz', sessionId, participantId), 'answer-refused', { reason });
  }
```

- [ ] **Step 3 : câbler le module Nest**

Remplacer `packages/module-quiz/src/quiz.module.ts` par :

```ts
import { Module } from '@nestjs/common';
import { eventBus, PrismaCardImageStore } from '@quetzal/core';
import { ManageBankUseCase } from './application/manage-bank.use-case.js';
import { ManageSessionUseCase } from './application/manage-session.use-case.js';
import { JoinSessionUseCase } from './application/join-session.use-case.js';
import { RunQuestionUseCase } from './application/run-question.use-case.js';
import { AnswerQuestionUseCase } from './application/answer-question.use-case.js';
import { FinishSessionUseCase } from './application/finish-session.use-case.js';
import { SessionReportUseCase } from './application/session-report.use-case.js';
import type { QuestionBankRepository } from './domain/ports/question-bank.repository.js';
import type { SessionRepository } from './domain/ports/session.repository.js';
import { PrismaQuestionBankRepository } from './infrastructure/prisma-question-bank.repository.js';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
import { QuizImageReferences } from './infrastructure/quiz-image-references.js';
import { BankController } from './presentation/bank.controller.js';
import { SessionController } from './presentation/session.controller.js';
import { QuizImageController, QUIZ_IMAGE_STORE } from './presentation/image.controller.js';
import { QuizBroadcaster } from './presentation/quiz.broadcaster.js';
import { QuizGateway } from './presentation/quiz.gateway.js';

const BANKS = 'QuizQuestionBankRepository';
const SESSIONS = 'QuizSessionRepository';
const HORLOGE = 'QuizHorloge';

@Module({
  controllers: [BankController, SessionController, QuizImageController],
  providers: [
    QuizImageReferences,
    { provide: BANKS, useClass: PrismaQuestionBankRepository },
    { provide: SESSIONS, useClass: PrismaSessionRepository },
    { provide: QUIZ_IMAGE_STORE, useClass: PrismaCardImageStore },
    // ⛔ L'horloge est un provider, pas un `Date.now()` en dur : c'est ce qui a
    // rendu testables la grâce, l'échéance et le bonus.
    { provide: HORLOGE, useValue: () => Date.now() },
    {
      provide: ManageBankUseCase,
      useFactory: (banks: QuestionBankRepository) => new ManageBankUseCase(banks),
      inject: [BANKS],
    },
    {
      provide: ManageSessionUseCase,
      useFactory: (sessions: SessionRepository, banks: QuestionBankRepository) =>
        new ManageSessionUseCase(sessions, banks, eventBus),
      inject: [SESSIONS, BANKS],
    },
    {
      provide: JoinSessionUseCase,
      useFactory: (sessions: SessionRepository) => new JoinSessionUseCase(sessions),
      inject: [SESSIONS],
    },
    {
      provide: RunQuestionUseCase,
      useFactory: (sessions: SessionRepository, horloge: () => number) =>
        new RunQuestionUseCase(sessions, horloge, eventBus),
      inject: [SESSIONS, HORLOGE],
    },
    {
      provide: AnswerQuestionUseCase,
      useFactory: (sessions: SessionRepository, horloge: () => number) =>
        new AnswerQuestionUseCase(sessions, horloge, eventBus),
      inject: [SESSIONS, HORLOGE],
    },
    {
      provide: FinishSessionUseCase,
      useFactory: (sessions: SessionRepository) => new FinishSessionUseCase(sessions, eventBus),
      inject: [SESSIONS],
    },
    {
      provide: SessionReportUseCase,
      useFactory: (sessions: SessionRepository) => new SessionReportUseCase(sessions),
      inject: [SESSIONS],
    },
    QuizBroadcaster,
    QuizGateway,
  ],
})
export class QuizModule {}
```

⚠️ `QuizImageReferences` doit aussi être enregistré dans le tableau
`IMAGE_REFERENCE_PROVIDERS` de `apps/api/src/app.module.ts` (tâche 3 du plan 1),
sinon les images du quiz seraient ramassées à la première suppression de jeu de
loto.

- [ ] **Step 4 : vérifier, puis commit**

```bash
pnpm --filter @quetzal/module-quiz exec eslint src > /tmp/l.log 2>&1; echo "LINT  : $?"
node node_modules/typescript/bin/tsc --noEmit --project packages/module-quiz/tsconfig.typecheck.json > /tmp/t.log 2>&1; echo "TYPES : $?"
grep -m3 "error TS" /tmp/t.log
pnpm --filter @quetzal/module-quiz exec vitest run > /tmp/v.log 2>&1; echo "TESTS : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: les trois **CODE : 0**.

- [ ] **Step 5 : prouver que la réponse ne fuite pas vers les élèves**

C'est le garde le plus important de la tâche, et aucun test unitaire ne le voit :
il faut lire la charge.

```bash
echo "### isCorrect part-il vers la salle ? "
grep -n "isCorrect" packages/module-quiz/src/presentation/quiz.broadcaster.ts
echo "--- attendu : UNIQUEMENT dans answerAcknowledged, vers un subgroup ---"
echo ""
echo "### acceptedAnswers part-il quelque part ?"
grep -c "acceptedAnswers" packages/module-quiz/src/presentation/quiz.broadcaster.ts packages/module-quiz/src/presentation/quiz.gateway.ts
echo "--- attendu : 0 et 0 ---"
```

Expected: `isCorrect` n'apparaît que dans `answerAcknowledged`, qui émet vers
`rooms.subgroup`, et `acceptedAnswers` **zéro fois** dans les deux fichiers.

⛔ Si `isCorrect` ou `acceptedAnswers` apparaît dans `questionOpened` ou dans le
`state` de la passerelle, la réponse est dans le code source de la page et un
élève curieux la lit en trois gestes. Le corriger avant de continuer.

```bash
git add packages/module-quiz/src/presentation/quiz.broadcaster.ts packages/module-quiz/src/presentation/quiz.gateway.ts packages/module-quiz/src/quiz.module.ts
git commit -m "feat(quiz): la passerelle et le diffuseur

answer est le SEUL message entrant du module ; tout le reste est une
commande HTTP (D9).

⛔ La charge de question-opened est la plus dangereuse du module : elle
part vers les telephones des eleves, donc elle ne porte NI isCorrect NI
acceptedAnswers. Les envoyer mettrait la reponse dans le code source de
la page, ou un eleve curieux la lirait en trois gestes. Verifie par
lecture de la charge, parce qu aucun test unitaire ne le voit.

Le resultat d une reponse part vers le SEUL participant, jamais vers la
salle : dire juste ou faux pendant que les autres repondent encore
fuiterait la reponse.

Un refus d echeance ou un double appui est diffuse comme answer-refused
et non leve : l eleve doit le lire, pas voir sa page casser.

L horloge est un provider et non un Date.now() en dur, et c est ce qui a
rendu testables la grace, l echeance et le bonus.

afterInit et non handleConnection pour attacher le serveur : issue #34 du
loto, toute diffusion anterieure a la premiere connexion partait sinon
dans le vide, sans erreur."
```

---

## Task 16 : l'écran animatrice

**Files:**
- Create: `packages/module-quiz/src/presentation/ui/host-session.tsx`
- Create: `packages/module-quiz/src/presentation/ui/use-quiz-socket.ts`
- Modify: `packages/module-quiz/src/client.ts`
- Modify: `packages/module-quiz/src/i18n/{fr,en,es}.json`

- [ ] **Step 1 : le crochet de socket, copié du loto**

`packages/module-quiz/src/presentation/ui/use-quiz-socket.ts` — reprendre
`packages/module-loto/src/presentation/ui/use-game-socket.ts` à l'identique et
remplacer `loto` par `quiz`, `gameId` par `sessionId`. ⚠️ Ne pas réécrire : ce
fichier porte des correctifs d'issues (reconnexion, nettoyage à la sortie) qu'une
réécriture perdrait.

- [ ] **Step 2 : les clés de traduction, à parité**

Ajouter dans `fr.json`, sous `module.quiz` :

```json
      "session": {
        "title": "Séance",
        "create": "Nouvelle séance",
        "mode": "Mode de jeu",
        "modeDefi": "Défi, avec minuteur et bonus de vitesse",
        "modeControle": "Contrôle, sans minuteur",
        "maxParticipants": "Nombre de participants au maximum",
        "defaultTimeLimit": "Délai par défaut, en secondes",
        "joinCode": "Code d entrée : {code}",
        "open": "Ouvrir les entrées",
        "start": "Commencer",
        "next": "Question suivante",
        "close": "Fermer la question",
        "finish": "Terminer la séance",
        "participants": "{count} participant(s)",
        "answered": "{answered} sur {total} ont répondu",
        "waiting": "En attente de participants",
        "report": "Retour de séance",
        "reportQuestion": "Question {rank} : {correct} juste(s) sur {answered} réponse(s)",
        "reportMissing": "{count} sans réponse",
        "rename": "Renommer le participant {index}"
      }
```

Les mêmes clés dans `en.json` et `es.json`. ⚠️ Parité obligatoire : le test de
catalogues de `packages/i18n` échoue sur une clé présente dans une seule langue.

- [ ] **Step 3 : écrire l'écran**

`packages/module-quiz/src/presentation/ui/host-session.tsx` :

```tsx
'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input, Label } from '@quetzal/ui';
import { useQuizSocket } from './use-quiz-socket.js';

interface ParticipantVue {
  id: string;
  participantIndex: number;
  name: string | null;
  score: number;
  memberNames: string[];
}

interface SessionVue {
  id: string;
  status: 'brouillon' | 'ouverte' | 'en-cours' | 'terminee';
  mode: 'defi' | 'controle';
  joinCode: string;
  questionCount: number;
  participants: ParticipantVue[];
}

export default function HostSession({ sessionId }: { sessionId: string }) {
  const t = useTranslations('module.quiz.session');
  const { state, question, closed } = useQuizSocket({ sessionId });
  const [renommage, setRenommage] = useState<Record<string, string>>({});

  async function commande(chemin: string): Promise<void> {
    await apiClient().apiFetch(`/api/modules/quiz/sessions/${sessionId}/${chemin}`, {
      method: 'POST',
    });
  }

  async function renommer(participantId: string): Promise<void> {
    const saisi = (renommage[participantId] ?? '').trim();
    await apiClient().apiFetch(
      `/api/modules/quiz/sessions/${sessionId}/participants/${participantId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // `null` est une valeur VOULUE : c'est ainsi qu'on annule un renommage
        // et que le participant retrouve son nom dérivé (issue #29 du loto).
        body: JSON.stringify({ name: saisi === '' ? null : saisi }),
      },
    );
  }

  const session: SessionVue | null = state?.session ?? null;
  if (session === null) return <p>{t('waiting')}</p>;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* Le code d'entrée en grand : il est lu de loin sur un vidéoprojecteur. */}
      <p className="text-3xl font-mono" data-testid="join-code">
        {t('joinCode', { code: session.joinCode })}
      </p>

      <p data-testid="participant-count">
        {t('participants', { count: session.participants.length })}
      </p>

      <div className="flex flex-wrap gap-2">
        {session.status === 'brouillon' && (
          <Button onClick={() => void commande('open')} data-testid="open">{t('open')}</Button>
        )}
        {session.status === 'ouverte' && (
          <Button onClick={() => void commande('start')} data-testid="start">{t('start')}</Button>
        )}
        {session.status === 'en-cours' && question === null && (
          <Button onClick={() => void commande('questions/next')} data-testid="next">
            {t('next')}
          </Button>
        )}
        {session.status === 'en-cours' && question !== null && (
          <Button onClick={() => void commande('questions/close')} data-testid="close">
            {t('close')}
          </Button>
        )}
        {session.status !== 'terminee' && (
          <Button onClick={() => void commande('finish')} data-testid="finish">
            {t('finish')}
          </Button>
        )}
      </div>

      {question !== null && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl">{question.prompt}</h2>
          {/* ⛔ Les propositions sont affichées SANS marquer la juste : l'écran
              animatrice est projeté, donc la classe le voit. */}
          <ul className="flex flex-col gap-1">
            {question.options.map((option) => (
              <li key={option.id}>{option.label}</li>
            ))}
          </ul>
        </section>
      )}

      {closed !== null && (
        <p role="status" data-testid="question-result">
          {t('reportQuestion', {
            rank: closed.rank ?? 0,
            correct: closed.correctCount,
            answered: closed.answerCount,
          })}
        </p>
      )}

      <ul className="flex flex-col gap-2" data-testid="participants">
        {session.participants.map((participant) => (
          <li key={participant.id} className="flex items-center gap-2 rounded border px-3 py-2">
            <span>{participant.name ?? participant.memberNames[0] ?? participant.participantIndex}</span>
            <span data-testid={`score-${participant.id}`}>{participant.score}</span>
            <Label htmlFor={`rename-${participant.id}`}>
              {t('rename', { index: participant.participantIndex })}
            </Label>
            <Input
              id={`rename-${participant.id}`}
              maxLength={40}
              value={renommage[participant.id] ?? participant.name ?? ''}
              onChange={(event) =>
                setRenommage((courant) => ({ ...courant, [participant.id]: event.target.value }))
              }
              onBlur={() => void renommer(participant.id)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

⚠️ Chaque libellé de renommage porte **le numéro du participant** : « Renommer »
répété six fois ne dit pas à un lecteur d'écran lequel. C'est la leçon que le
loto a tirée pour ses cartes.

- [ ] **Step 4 : déclarer les deux routes d'écran**

Dans `packages/module-quiz/src/client.ts`, ajouter à `uiRoutes` :

```ts
    {
      path: 'sessions/:sessionId',
      component: () => import('./presentation/ui/host-session.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'full',
    },
    {
      path: 'sessions/:sessionId/report',
      component: () => import('./presentation/ui/session-report.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
```

⚠️ `layout: 'full'` pour l'écran de séance : il est projeté, et la coquille
mangerait la place du code d'entrée.

- [ ] **Step 5 : vérifier, puis commit**

```bash
pnpm --filter @quetzal/module-quiz exec eslint src > /tmp/l.log 2>&1; echo "LINT  : $?"
grep -m3 "jsx-no-literals" /tmp/l.log
pnpm --filter @quetzal/i18n exec vitest run > /tmp/v.log 2>&1; echo "I18N  : $?"
```

Expected: les deux **CODE : 0**. ⚠️ Si `react/jsx-no-literals` signale une
chaîne, un libellé a échappé à l'i18n : le passer en clé plutôt que désactiver
la règle.

```bash
git add packages/module-quiz/src/presentation/ui packages/module-quiz/src/client.ts packages/i18n/catalogues
git commit -m "feat(quiz): l ecran animatrice

Le code d entree en grand et en monospace : il est lu de loin sur un
videoprojecteur, et layout full plutot que shell pour la meme raison.

⛔ Les propositions sont affichees SANS marquer la juste : cet ecran est
projete, donc la classe le voit.

Chaque libelle de renommage porte le NUMERO du participant : « Renommer »
repete six fois ne dit pas a un lecteur d ecran lequel. C est la lecon
que le loto a tiree pour ses cartes.

use-quiz-socket est repris a l identique de use-game-socket et non
reecrit : ce fichier porte des correctifs d issues qu une reecriture
perdrait."
```

---

> **Suite et fin.** Les tâches 17 à 20 sont dans
> [`2026-11-08-module-quiz-seance-7.md`](./2026-11-08-module-quiz-seance-7.md) :
> l'écran élève avec le plancher d'accessibilité en entier, le retour de séance,
> l'e2e des deux modes, et la vérification complète avant la PR.
