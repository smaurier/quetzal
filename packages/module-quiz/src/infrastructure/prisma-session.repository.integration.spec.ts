import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { getTenantScopedPrisma, tenantStore } from '@quetzal/core';
import { newId } from '@quetzal/db';
import { PrismaSessionRepository } from './prisma-session.repository.js';
import type { FrozenQuestion } from '../domain/ports/session.repository.js';
import type { SessionStatus } from '../domain/session-status.js';
import { JoinCodeAlreadyUsedError, ParticipantIndexTakenError } from '../domain/errors.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

/** Le client cloisonne, pour poser en test ce que le port ne sait pas ecrire : des horodatages imposes. */
function brut() {
  return getTenantScopedPrisma() as unknown as {
    quiz_Member: { createMany(args: unknown): Promise<unknown> };
    quiz_Answer: { createMany(args: unknown): Promise<unknown> };
  };
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
      repo.ajouterParticipant({ sessionId: session.id, participantIndex: 1, guestId: 'g-1', displayName: 'Ana' }));

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

    const premiere = await inTenant(tenantId, ownerId, () => repo.enregistrerReponse(base));
    const seconde = await inTenant(tenantId, ownerId, () => repo.enregistrerReponse(base));

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
      repo.ajouterParticipant({ sessionId: session.id, participantIndex: 1, guestId: 'g-7', displayName: 'Ana' }));

    const retrouve = await inTenant(tenantId, ownerId, () =>
      repo.findParticipantByGuest({ sessionId: session.id, guestId: 'g-7' }));
    expect(retrouve?.id).toBe(participant.id);
    expect(retrouve?.memberNames).toEqual(['Ana']);
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
  /**
   * Ce qui suit tient l'adaptateur a la hauteur de la doublure
   * `FakeSessionRepository`, qui fait foi pour les cas d'usage : une
   * production plus permissive ou plus bavarde que la doublure ferait passer
   * des tests de cas d'usage qui echoueraient en vrai.
   */
  describe('fidelite a la doublure', () => {
    async function uneSeance(code: string) {
      const { tenantId, ownerId } = await seedTenant();
      const deckId = await unJeu(tenantId, ownerId);
      const repo = new PrismaSessionRepository();
      const dans = <T>(fn: () => Promise<T>) => inTenant(tenantId, ownerId, fn);
      const nouvelle = (joinCode: string) => dans(() =>
        repo.create({
          deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
          guestLocale: null, joinCode, createdBy: ownerId,
        }));
      const session = await nouvelle(code);
      const place = (sessionId: string, participantIndex: number, guestId = `g-${String(participantIndex)}`) =>
        dans(() => repo.ajouterParticipant({ sessionId, participantIndex, guestId, displayName: 'Léa' }));
      return { repo, session, dans, nouvelle, place, tenantId, ownerId, deckId };
    }

    it('traduit un code d entree deja pris dans le locataire en JoinCodeAlreadyUsedError', async () => {
      const { nouvelle } = await uneSeance('PRIS0001');
      await expect(nouvelle('PRIS0001')).rejects.toBeInstanceOf(JoinCodeAlreadyUsedError);
    });

    it('accepte le meme code d entree dans un autre locataire', async () => {
      await uneSeance('PARTAGE1');
      const { session } = await uneSeance('PARTAGE1');
      expect(session.joinCode).toBe('PARTAGE1');
    });

    it('traduit un participantIndex deja pris en ParticipantIndexTakenError', async () => {
      const { session, place } = await uneSeance('INDEX001');
      await place(session.id, 1);
      await expect(place(session.id, 1, 'g-autre')).rejects.toBeInstanceOf(ParticipantIndexTakenError);
    });

    it('accepte le meme participantIndex dans une autre seance', async () => {
      const { session, nouvelle, place } = await uneSeance('INDEX002');
      const autre = await nouvelle('INDEX003');
      await place(session.id, 1);
      await expect(place(autre.id, 1)).resolves.toMatchObject({ participantIndex: 1 });
    });

    it('rend les participants tries par participantIndex', async () => {
      const { repo, session, dans, nouvelle, place } = await uneSeance('PART0001');
      const autre = await nouvelle('PART0002');
      // Deux seances, et des index inseres a l'envers dans chacune : avec une
      // seule seance, Postgres peut servir la lecture par l'index unique
      // (sessionId, participantIndex, tenantId) et rendre l'ordre gratuitement.
      for (const id of [autre.id, session.id]) {
        for (const participantIndex of [3, 1, 2]) {
          await place(id, participantIndex);
        }
      }
      const relue = await dans(() => repo.findById(session.id));
      expect(relue?.participants.map((p) => p.participantIndex)).toEqual([1, 2, 3]);
    });

    it('rend les questions triees par rang, meme a cote d une autre seance', async () => {
      const { repo, session, dans, nouvelle } = await uneSeance('RANG0001');
      const autre = await nouvelle('RANG0002');
      const alEnvers = (prefixe: string) => [3, 1, 2].map((rank) => ({ ...FIGEE, rank, prompt: `${prefixe}${rank}` }));
      await dans(() => repo.freezeQuestions(autre.id, alEnvers('B')));
      await dans(() => repo.freezeQuestions(session.id, alEnvers('A')));
      const relue = await dans(() => repo.findById(session.id));
      expect(relue?.questions.map((q) => q.prompt)).toEqual(['A1', 'A2', 'A3']);
    });

    it('rend une reponse sous la forme exacte du port, sans colonne de la base', async () => {
      const { repo, session, dans, place } = await uneSeance('FORME001');
      await dans(() => repo.freezeQuestions(session.id, [FIGEE]));
      const sqId = (await dans(() => repo.findById(session.id)))?.questions[0]?.id ?? '';
      const participant = await place(session.id, 1);
      const reponse = {
        sessionQuestionId: sqId, participantId: participant.id, authorGuestId: 'g-1',
        optionId: 'o-1', value: null, isCorrect: true, elapsedMs: 1200, points: 1200,
      };

      const ecrite = await dans(() => repo.enregistrerReponse(reponse));

      expect(ecrite).toEqual({ ...reponse, id: ecrite?.id });
      expect(await dans(() => repo.answersFor(sqId))).toEqual([ecrite]);
      expect(await dans(() => repo.allAnswers(session.id))).toEqual([ecrite]);
    });

    it('rend les membres dans leur ordre d arrivee', async () => {
      const { session, dans, place, repo } = await uneSeance('ARRI0001');
      const participant = await place(session.id, 1, 'g-1');
      // Inseres a rebours de leur horodatage : sans ORDER BY, Postgres rendrait
      // l'ordre physique d'insertion.
      await dans(() => brut().quiz_Member.createMany({
        data: [
          { id: newId(), participantId: participant.id, guestId: 'g-3', displayName: 'Cal', createdAt: new Date('2030-01-01T00:00:02Z') },
          { id: newId(), participantId: participant.id, guestId: 'g-2', displayName: 'Bea', createdAt: new Date('2030-01-01T00:00:01Z') },
        ],
      }));
      expect((await dans(() => repo.findById(session.id)))?.participants[0]?.memberNames).toEqual(['Léa', 'Bea', 'Cal']);
      expect((await dans(() => repo.findParticipantByGuest({ sessionId: session.id, guestId: 'g-3' })))?.memberNames)
        .toEqual(['Léa', 'Bea', 'Cal']);
    });

    it('rend les reponses d une question dans leur ordre d arrivee', async () => {
      const { session, dans, place, repo } = await uneSeance('ARRI0002');
      await dans(() => repo.freezeQuestions(session.id, [FIGEE]));
      const sqId = (await dans(() => repo.findById(session.id)))?.questions[0]?.id ?? '';
      const premier = await place(session.id, 1);
      const second = await place(session.id, 2);
      const ligne = (participantId: string, createdAt: string) => ({
        id: newId(), sessionQuestionId: sqId, participantId, authorGuestId: 'g', optionId: 'o-1',
        value: null, isCorrect: true, elapsedMs: 1, points: 1, createdAt: new Date(createdAt),
      });
      await dans(() => brut().quiz_Answer.createMany({
        data: [ligne(second.id, '2030-01-01T00:00:02Z'), ligne(premier.id, '2030-01-01T00:00:01Z')],
      }));
      const ordre = (await dans(() => repo.answersFor(sqId))).map((r) => r.participantId);
      expect(ordre).toEqual([premier.id, second.id]);
    });
    /**
     * Le garde `isSessionStatus` de la lecture ne peut pas etre atteint depuis
     * une vraie base : la CHECK le precede. Ce test prouve ce premier rempart ;
     * le garde lui-meme est prouve par le test unitaire de la lecture.
     */
    it('la base refuse un statut inconnu', async () => {
      const { repo, session, dans } = await uneSeance('STAT0001');
      const inconnu = 'archivee' as unknown as SessionStatus;
      await expect(dans(() => repo.setStatus(session.id, inconnu))).rejects.toThrow(/Quiz_Session_status_check/);
    });
  });

  /**
   * Chaque ecriture qui touche deux tables le fait en UNE operation : un arret
   * entre deux appels laisserait une reponse sans ses points (jamais
   * rattrapee, le rejeu rend `null`), ou un participant sans membre qui occupe
   * son index sans qu'aucun invite ne le retrouve.
   */
  describe('ecritures atomiques', () => {
    async function uneQuestionEtUnParticipant(code: string) {
      const { tenantId, ownerId } = await seedTenant();
      const deckId = await unJeu(tenantId, ownerId);
      const repo = new PrismaSessionRepository();
      const dans = <T>(fn: () => Promise<T>) => inTenant(tenantId, ownerId, fn);
      const session = await dans(() => repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: code, createdBy: ownerId,
      }));
      await dans(() => repo.freezeQuestions(session.id, [FIGEE]));
      const sqId = (await dans(() => repo.findById(session.id)))?.questions[0]?.id ?? '';
      const participant = await dans(() =>
        repo.ajouterParticipant({ sessionId: session.id, participantIndex: 1, guestId: 'g-1', displayName: 'Ana' }));
      const reponse = {
        sessionQuestionId: sqId, participantId: participant.id, authorGuestId: 'g-1',
        optionId: 'o-1', value: null, isCorrect: true, elapsedMs: 1200, points: 1200,
      };
      const score = async () => (await dans(() => repo.findById(session.id)))?.participants[0]?.score;
      return { repo, dans, session, sqId, participant, reponse, score };
    }

    it('une reponse acceptee incremente le score de ses points', async () => {
      const { repo, dans, reponse, score } = await uneQuestionEtUnParticipant('ATOM0001');
      expect(await dans(() => repo.enregistrerReponse(reponse))).not.toBeNull();
      expect(await score()).toBe(1200);
    });

    it('une reponse en double rend null et ne touche pas au score', async () => {
      const { repo, dans, reponse, score } = await uneQuestionEtUnParticipant('ATOM0002');
      await dans(() => repo.enregistrerReponse(reponse));
      expect(await dans(() => repo.enregistrerReponse({ ...reponse, points: 999 }))).toBeNull();
      expect(await score()).toBe(1200);
    });

    it('une reponse refusee par la base ne laisse aucun point', async () => {
      const { repo, dans, reponse, score, session } = await uneQuestionEtUnParticipant('ATOM0003');
      await expect(dans(() => repo.enregistrerReponse({ ...reponse, sessionQuestionId: 'question-fantome' })))
        .rejects.toThrow(/foreign key|Foreign key/);
      expect(await score()).toBe(0);
      expect(await dans(() => repo.allAnswers(session.id))).toEqual([]);
    });

    it('cree le participant avec son premier membre', async () => {
      const { repo, dans, session, participant } = await uneQuestionEtUnParticipant('ATOM0004');
      expect(participant.memberNames).toEqual(['Ana']);
      const relue = await dans(() => repo.findById(session.id));
      expect(relue?.participants.map((p) => [p.id, p.memberNames])).toEqual([[participant.id, ['Ana']]]);
    });

    it('un membre refuse par la base ne laisse aucun participant', async () => {
      const { repo, dans, session } = await uneQuestionEtUnParticipant('ATOM0005');
      await expect(dans(() => repo.ajouterParticipant({
        sessionId: session.id, participantIndex: 2, guestId: 'g-2', displayName: 'x'.repeat(33),
      }))).rejects.toThrow(/too long/);
      const relue = await dans(() => repo.findById(session.id));
      expect(relue?.participants.map((p) => p.participantIndex)).toEqual([1]);
    });

    it('un autre locataire ne voit ni les reponses ni les membres, et ne marque rien', async () => {
      const { repo, dans, reponse, sqId, session, score } = await uneQuestionEtUnParticipant('VOIS0001');
      await dans(() => repo.enregistrerReponse(reponse));
      const voisin = await seedTenant();
      const chezLeVoisin = <T>(fn: () => Promise<T>) => inTenant(voisin.tenantId, voisin.ownerId, fn);

      expect(await dans(() => repo.answersFor(sqId)), 'temoin : le proprietaire les voit').toHaveLength(1);
      expect(await dans(() => repo.allAnswers(session.id)), 'temoin').toHaveLength(1);
      expect(await chezLeVoisin(() => repo.answersFor(sqId))).toEqual([]);
      expect(await chezLeVoisin(() => repo.allAnswers(session.id))).toEqual([]);
      expect(await dans(() => repo.findParticipantByGuest({ sessionId: session.id, guestId: 'g-1' })),
        'temoin : le proprietaire retrouve son invite').not.toBeNull();
      expect(await chezLeVoisin(() => repo.findParticipantByGuest({ sessionId: session.id, guestId: 'g-1' })))
        .toBeNull();

      await expect(chezLeVoisin(() => repo.enregistrerReponse({ ...reponse, points: 50 }))).rejects.toThrow();
      await expect(chezLeVoisin(() => repo.ajouterParticipant({
        sessionId: session.id, participantIndex: 2, guestId: 'g-9', displayName: 'Intrus',
      }))).rejects.toThrow();
      expect(await score()).toBe(1200);
      expect((await dans(() => repo.findById(session.id)))?.participants).toHaveLength(1);
    });
  });
});
