import { z } from 'zod';
import { GAME_STATUSES } from '../../domain/game-status.js';
import { PATTERN_KEYS } from '../../domain/pattern.js';

export const createDeckSchema = z.object({
  name: z.string().min(1).max(120),
  duplicateOf: z.string().min(1).optional(),
});

export const patchDeckSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  card: z
    .object({
      rank: z.number().int().min(1),
      label: z.string().min(1).max(80).optional(),
      imageId: z.string().min(1).nullable().optional(),
    })
    .optional(),
});

export const createGameSchema = z.object({
  deckId: z.string().min(1),
  pattern: z.enum(PATTERN_KEYS),
  maxTeams: z.number().int().min(1).max(20),
  falseClaimPenaltyDraws: z.number().int().min(0).max(99),
});

export const uploadImageSchema = z.object({
  mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  /** Contenu encodé en base64, déjà redimensionné par le navigateur. */
  data: z.string().min(1).max(4_000_000),
});

export type CreateDeckBody = z.infer<typeof createDeckSchema>;
export type PatchDeckBody = z.infer<typeof patchDeckSchema>;
export type CreateGameBody = z.infer<typeof createGameSchema>;
export type UploadImageBody = z.infer<typeof uploadImageSchema>;

export const gameStatusValues = GAME_STATUSES;
