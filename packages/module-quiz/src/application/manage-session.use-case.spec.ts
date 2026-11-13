import { describe, it, expect } from 'vitest';
import {
  BankNotFoundError,
  EmptyBankError,
  InvalidSessionTransitionError,
  JoinCodeAlreadyUsedError,
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

type NouvelleSeance = Parameters<FakeSessionRepository['create']>[0];

/**
 * La base est seule juge de l'unicite : entre le `findByJoinCode` et le
 * `create`, une autre seance peut prendre le code. Cette doublure rejoue cette
 * course en levant au premier `create`, alors que `findByJoinCode` a dit libre.
 */
class SessionsQuiPerdentLaCourse extends FakeSessionRepository {
  readonly codesTentes: string[] = [];

  override async create(input: NouvelleSeance) {
    this.codesTentes.push(input.joinCode);
    if (this.codesTentes.length === 1) throw new JoinCodeAlreadyUsedError(input.joinCode);
    return super.create(input);
  }
}

class SessionsToujoursPrises extends FakeSessionRepository {
  readonly refus: JoinCodeAlreadyUsedError[] = [];

  override async create(input: NouvelleSeance): Promise<never> {
    const refus = new JoinCodeAlreadyUsedError(input.joinCode);
    this.refus.push(refus);
    throw refus;
  }
}

class SessionsEnPanne extends FakeSessionRepository {
  appels = 0;
  readonly panne = new Error('base injoignable');

  override async create(): Promise<never> {
    this.appels += 1;
    throw this.panne;
  }
}

const CREATION = {
  deckId: 'bank-1', mode: 'defi', maxParticipants: 6,
  defaultTimeLimit: 20, createdBy: 'u-1',
} as const;

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
      })).rejects.toThrow(BankNotFoundError);
  });
});

describe('ManageSessionUseCase, collision du code d entree', () => {
  it('retente un autre code quand la base refuse le premier', async () => {
    const banks = new FakeQuestionBankRepository();
    banks.add(bankOf(1));
    const sessions = new SessionsQuiPerdentLaCourse();
    const useCase = new ManageSessionUseCase(sessions, banks);

    const session = await useCase.create(CREATION);

    expect(sessions.codesTentes).toHaveLength(2);
    expect(session.joinCode).toBe(sessions.codesTentes[1]);
    expect(await sessions.findById(session.id)).not.toBeNull();
  });

  it('laisse remonter intacte toute autre erreur de la base, sans retenter', async () => {
    const banks = new FakeQuestionBankRepository();
    banks.add(bankOf(1));
    const sessions = new SessionsEnPanne();
    const useCase = new ManageSessionUseCase(sessions, banks);

    await expect(useCase.create(CREATION)).rejects.toBe(sessions.panne);
    expect(sessions.appels).toBe(1);
  });

  /** Une seance « introuvable » se traduirait en 404 : c'est le refus de la base qui dit vrai. */
  it('abandonne apres dix refus en relancant le dernier refus de la base', async () => {
    const banks = new FakeQuestionBankRepository();
    banks.add(bankOf(1));
    const sessions = new SessionsToujoursPrises();
    const useCase = new ManageSessionUseCase(sessions, banks);

    const echec = useCase.create(CREATION);

    await expect(echec).rejects.toBeInstanceOf(JoinCodeAlreadyUsedError);
    expect(sessions.refus).toHaveLength(10);
    await expect(echec).rejects.toBe(sessions.refus[9]);
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

  /** Le second refus de `resoudreLeDelai` : un delai hors bornes est un echec, pas un delai. */
  it('refuse de demarrer un defi dont une question a un delai hors bornes', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1, { timeLimit: 600 })] }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: 20 }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow(
      TimeLimitUnresolvableError);
    expect((await sessions.findById('session-1'))?.questions).toHaveLength(0);
  });

  it('ne fige rien du tout quand une seule question est irresoluble', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, {
      questions: [questionOf(1, { timeLimit: 20 }), questionOf(2, { timeLimit: null })],
    }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: null }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow(
      TimeLimitUnresolvableError);

    // Tout ou rien : une seance a moitie figee est le pire etat possible.
    expect((await sessions.findById('session-1'))?.questions).toHaveLength(0);
    expect((await sessions.findById('session-1'))?.status).toBe('ouverte');
  });

  it('refuse de demarrer une banque vide', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(0, { questions: [] }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [] }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toBeInstanceOf(EmptyBankError);
    expect((await sessions.findById('session-1'))?.status).toBe('ouverte');
  });

  it('refuse de demarrer depuis un brouillon, sans passer par ouverte', async () => {
    const { banks, sessions, useCase } = build();
    banks.add(bankOf(2));
    sessions.add(sessionOf({ status: 'brouillon', questions: [] }));

    await expect(useCase.start({ sessionId: 'session-1' })).rejects.toThrow(
      InvalidSessionTransitionError);
    const session = await sessions.findById('session-1');
    expect(session?.status).toBe('brouillon');
    expect(session?.questions).toEqual([]);
  });

  /**
   * ⛔ D10 champ par champ : la copie figee est la seule que la seance lira.
   * Un champ oublie au figement (image, texte alternatif, reponses acceptees,
   * regles de saisie) disparaitrait en seance sans qu'aucune autre assertion
   * ne le voie. Valeurs choisies differentes des defauts, expres.
   */
  it('fige chaque champ de chaque question, a l identique', async () => {
    const { banks, sessions, useCase } = build();
    const aImage = questionOf(1, {
      prompt: 'Que montre l image ?',
      imageId: 'img-1',
      imageAlt: 'Une chaise en bois',
      timeLimit: 30,
      options: [
        { id: 'o-a', rank: 1, label: null, imageId: 'img-o', imageAlt: 'Une table', isCorrect: false },
        { id: 'o-b', rank: 2, label: 'la silla', imageId: null, imageAlt: null, isCorrect: true },
      ],
    });
    const aSaisie = questionOf(2, {
      prompt: 'Ecris « chaise » en espagnol',
      answerMode: 'saisie',
      timeLimit: null,
      regles: { accentsSensibles: false, casseSensible: true },
      options: [],
      acceptedAnswers: ['silla', 'la silla'],
    });
    banks.add(bankOf(0, { questions: [aImage, aSaisie] }));
    sessions.add(sessionOf({ status: 'ouverte', questions: [], defaultTimeLimit: 15 }));

    await useCase.start({ sessionId: 'session-1' });

    const figee = (q: typeof aImage, timeLimitResolved: number) => ({
      id: expect.any(String),
      rank: q.rank,
      questionId: q.id,
      prompt: q.prompt,
      imageId: q.imageId,
      imageAlt: q.imageAlt,
      answerMode: q.answerMode,
      timeLimitResolved,
      regles: q.regles,
      options: q.options,
      acceptedAnswers: q.acceptedAnswers,
      openedAt: null,
      deadlineAt: null,
      closedAt: null,
    });
    expect((await sessions.findById('session-1'))?.questions).toEqual([
      figee(aImage, 30),
      figee(aSaisie, 15),
    ]);
  });
});

describe('ManageSessionUseCase, renommage', () => {
  async function renommer(name: string | null) {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours' }));
    const participant = await sessions.ajouterParticipant({
      sessionId: 'session-1', participantIndex: 1, guestId: 'g-1', displayName: 'Ana',
    });
    await useCase.rename({ participantId: participant.id, name });
    return (await sessions.findById('session-1'))?.participants[0]?.name;
  }

  it('renomme un participant avec un nom nettoye de ses blancs', async () => {
    expect(await renommer('  Les Lynx  ')).toBe('Les Lynx');
  });

  it('annule le renommage sur un nom vide ou blanc', async () => {
    expect(await renommer('   ')).toBeNull();
  });

  it('annule le renommage sur null', async () => {
    expect(await renommer(null)).toBeNull();
  });
});
