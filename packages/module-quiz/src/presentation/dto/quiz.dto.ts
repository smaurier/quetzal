import { z } from 'zod';
import { ANSWER_MODES } from '../../domain/answer-mode.js';
import { SESSION_MODES } from '../../domain/session-mode.js';
import { TIME_LIMIT_MAX, TIME_LIMIT_MIN } from '../../domain/time-limit.js';

/** `duplicateOf` absent = banque vierge ; présent = copie de travail. */
export const createBankSchema = z.object({
  name: z.string().trim().min(1).max(120),
  duplicateOf: z.string().min(1).optional(),
});

export const renameBankSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const addQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(400),
  answerMode: z.enum(ANSWER_MODES),
});

const optionSchema = z
  .object({
    rank: z.number().int().min(1).max(4),
    label: z.string().trim().min(1).max(160).nullable(),
    imageId: z.string().min(1).nullable(),
    isCorrect: z.boolean(),
  })
  // La même règle que la CHECK en base : une proposition sans texte ni image
  // n'a rien à afficher. Refusée ici, elle n'atteint jamais la base.
  .refine((option) => option.label !== null || option.imageId !== null, {
    message: 'une proposition porte un texte, une image, ou les deux',
  });

export const patchQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(400).optional(),
  imageId: z.string().min(1).nullable().optional(),
  imageAlt: z.string().trim().min(1).max(200).nullable().optional(),
  // Bornes de la spec §3.3. `null` = hériter du défaut de session.
  timeLimit: z.number().int().min(3).max(120).nullable().optional(),
  accentsSensibles: z.boolean().optional(),
  casseSensible: z.boolean().optional(),
  options: z.array(optionSchema).min(2).max(4).optional(),
  acceptedAnswers: z.array(z.string().trim().min(1).max(160)).min(1).optional(),
});

export const uploadQuizImageSchema = z.object({
  // Une liste fermée, et non `startsWith('image/')` : `image/svg+xml` porte du
  // script, et serait servi depuis notre origine.
  mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  /** Contenu encodé en base64, déjà redimensionné par le navigateur. */
  data: z.string().min(1).max(4_000_000),
  // ⛔ Requis, pas facultatif. WCAG 1.1.1 : une image porteuse de sens sans
  // alternative est un mur. Le rendre optionnel ferait que l'oubli devient le
  // défaut, et personne ne reviendrait le corriger.
  alt: z.string().trim().min(1).max(200),
});

export const createSessionSchema = z
  .object({
    deckId: z.string().min(1),
    mode: z.enum(SESSION_MODES),
    // Le plafond de la CHECK `Quiz_Session_maxParticipants_check`. 60 est
    // EMPRUNTÉ à une mesure faite sur le loto, pas mesuré sur le quiz (#82).
    maxParticipants: z.number().int().min(1).max(60),
    defaultTimeLimit: z.number().int().min(TIME_LIMIT_MIN).max(TIME_LIMIT_MAX).nullable(),
    guestLocale: z.string().min(2).max(5).nullable().optional(),
  })
  // ⛔ Refusé ICI plutôt qu'au démarrage, quand c'est déjà évitable : une séance
  // de défi sans défaut de session ne pourra démarrer que si CHAQUE question
  // porte son propre délai. Le dire à la création épargne un refus devant la
  // classe, et le refus du démarrage reste, parce que la banque peut changer
  // entre les deux.
  .refine((v) => v.mode === 'controle' || v.defaultTimeLimit !== null, {
    message: 'un défi demande un délai par défaut, sauf si chaque question porte le sien',
    path: ['defaultTimeLimit'],
  });

/** Sans `min(1)` : un nom vide annule le renommage, le cas d'usage le lit `null`. */
export const renameParticipantSchema = z.object({
  name: z.string().trim().max(40).nullable(),
});

/**
 * Le nom affiché d'un invité, tel qu'il finit dans `Quiz_Member.displayName`
 * (`VarChar(32)`). Le jeton invité le borne à 32 SANS trim : la passerelle le
 * repasse ici avant de rejoindre, sinon un nom fait d'espaces entrerait.
 */
export const guestDisplayNameSchema = z.string().trim().min(1).max(32);

/**
 * Le seul message entrant du module. Le participant n'y est PAS : il vient de
 * l'identité du socket, sinon un invité répondrait au nom d'un autre.
 * `sessionQuestionId` est obligatoire : une réponse de grâce pour N serait
 * sinon jugée sur N+1. `value` non nettoyée (la normalisation est au domaine),
 * bornée par `Quiz_Answer.value` (`VarChar(160)`).
 */
export const answerMessageSchema = z.object({
  sessionQuestionId: z.string().min(1),
  optionId: z.string().min(1).optional(),
  value: z.string().max(160).optional(),
});

export type CreateBankBody = z.infer<typeof createBankSchema>;
export type RenameBankBody = z.infer<typeof renameBankSchema>;
export type AddQuestionBody = z.infer<typeof addQuestionSchema>;
export type PatchQuestionBody = z.infer<typeof patchQuestionSchema>;
export type UploadQuizImageBody = z.infer<typeof uploadQuizImageSchema>;
export type CreateSessionBody = z.infer<typeof createSessionSchema>;
export type RenameParticipantBody = z.infer<typeof renameParticipantSchema>;
