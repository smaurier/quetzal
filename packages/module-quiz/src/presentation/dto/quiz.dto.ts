import { z } from 'zod';
import { ANSWER_MODES } from '../../domain/answer-mode.js';

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
    label: z.string().trim().max(160).nullable(),
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
  // Bornes de la spec §3.3. `null` = hériter du défaut de session.
  timeLimit: z.number().int().min(3).max(120).nullable().optional(),
  accentsSensibles: z.boolean().optional(),
  casseSensible: z.boolean().optional(),
  options: z.array(optionSchema).min(2).max(4).optional(),
  acceptedAnswers: z.array(z.string().trim().min(1).max(160)).min(1).optional(),
});

export type CreateBankBody = z.infer<typeof createBankSchema>;
export type RenameBankBody = z.infer<typeof renameBankSchema>;
export type AddQuestionBody = z.infer<typeof addQuestionSchema>;
export type PatchQuestionBody = z.infer<typeof patchQuestionSchema>;
