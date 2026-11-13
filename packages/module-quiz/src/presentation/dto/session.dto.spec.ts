import { describe, it, expect } from 'vitest';
import {
  answerMessageSchema,
  createSessionSchema,
  guestDisplayNameSchema,
  renameParticipantSchema,
} from './quiz.dto.js';

const DEFI_VALIDE = {
  deckId: 'bank-1',
  mode: 'defi',
  maxParticipants: 30,
  defaultTimeLimit: 20,
  guestLocale: 'fr',
};

/**
 * Chaque borne est celle d'une colonne ou d'une CHECK de `models.prisma` et de
 * la migration `add_quiz_session` : une chaîne trop longue qui passerait ici
 * finirait en erreur Postgres brute (22001), donc en 500.
 */
describe('createSessionSchema', () => {
  it('accepte un defi complet', () => {
    expect(createSessionSchema.safeParse(DEFI_VALIDE).success).toBe(true);
  });

  it('refuse un mode hors de la liste fermee', () => {
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, mode: 'course' }).success).toBe(false);
  });

  it('borne maxParticipants a 60, comme la CHECK en base', () => {
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, maxParticipants: 60 }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, maxParticipants: 61 }).success).toBe(false);
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, maxParticipants: 0 }).success).toBe(false);
  });

  it('borne le delai par defaut aux bornes de la spec, 3 a 120 secondes', () => {
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, defaultTimeLimit: 2 }).success).toBe(false);
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, defaultTimeLimit: 121 }).success).toBe(false);
  });

  it('refuse un defi sans delai par defaut', () => {
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, defaultTimeLimit: null }).success).toBe(false);
  });

  it('accepte un controle sans delai par defaut', () => {
    expect(
      createSessionSchema.safeParse({ ...DEFI_VALIDE, mode: 'controle', defaultTimeLimit: null }).success,
    ).toBe(true);
  });

  it('borne guestLocale a 5 caracteres, VarChar(5)', () => {
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, guestLocale: 'es-MX' }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, guestLocale: 'es-MXX' }).success).toBe(false);
  });

  it('refuse un deckId vide', () => {
    expect(createSessionSchema.safeParse({ ...DEFI_VALIDE, deckId: '' }).success).toBe(false);
  });
});

describe('renameParticipantSchema', () => {
  it('accepte 40 caracteres, VarChar(40)', () => {
    expect(renameParticipantSchema.safeParse({ name: 'a'.repeat(40) }).success).toBe(true);
  });

  it('refuse 41 caracteres', () => {
    expect(renameParticipantSchema.safeParse({ name: 'a'.repeat(41) }).success).toBe(false);
  });

  /** Le trim passe avant la borne : des espaces autour ne coûtent rien en base. */
  it('mesure le nom apres trim', () => {
    const parsed = renameParticipantSchema.safeParse({ name: `  ${'a'.repeat(40)}  ` });
    expect(parsed.success && parsed.data.name).toBe('a'.repeat(40));
  });

  /** `null` annule un renommage (issue #29) : c'est une valeur voulue. */
  it('accepte null', () => {
    expect(renameParticipantSchema.safeParse({ name: null }).success).toBe(true);
  });
});

describe('guestDisplayNameSchema', () => {
  it('accepte 32 caracteres, VarChar(32) de Quiz_Member.displayName', () => {
    expect(guestDisplayNameSchema.safeParse('a'.repeat(32)).success).toBe(true);
  });

  it('refuse 33 caracteres', () => {
    expect(guestDisplayNameSchema.safeParse('a'.repeat(33)).success).toBe(false);
  });

  it('refuse un nom fait seulement d espaces', () => {
    expect(guestDisplayNameSchema.safeParse('   ').success).toBe(false);
  });

  it('rend le nom sans ses espaces de bord', () => {
    expect(guestDisplayNameSchema.parse('  Ana  ')).toBe('Ana');
  });
});

describe('answerMessageSchema', () => {
  it('refuse une reponse sans proposition ni saisie, des la frontiere', () => {
    expect(answerMessageSchema.safeParse({ sessionQuestionId: 'sq-1' }).success).toBe(false);
  });

  // D5 : une saisie vide est une réponse FAUSSE, pas une absence de réponse.
  it('accepte une saisie vide, et une proposition seule', () => {
    expect(answerMessageSchema.safeParse({ sessionQuestionId: 'sq-1', value: '' }).success).toBe(true);
    expect(answerMessageSchema.safeParse({ sessionQuestionId: 'sq-1', optionId: 'o-1' }).success).toBe(true);
  });
});
