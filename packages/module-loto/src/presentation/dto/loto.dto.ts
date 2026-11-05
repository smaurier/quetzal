import { z } from 'zod';
import { LOCALES } from '@quetzal/i18n';
import { GAME_STATUSES } from '../../domain/game-status.js';
import { PATTERN_KEYS } from '../../domain/pattern.js';
import { isValidPatternList } from '../../domain/pattern-list.js';

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

// Le rang n est PAS dans le corps : le serveur l attribue (cas d usage
// addCard), sinon le client devrait connaitre le prochain rang libre et
// pourrait se heurter a @@unique([deckId, rank, tenantId]). Issue #26.
export const addCardSchema = z.object({
  label: z.string().max(80).optional(),
  imageId: z.string().min(1).nullable().optional(),
});

export const createGameSchema = z.object({
  deckId: z.string().min(1),
  // Validee ici AUSSI, et pas seulement dans le middleware : celui-ci
  // protege l affichage, pas ce qu on ecrit en base.
  guestLocale: z.enum(LOCALES).nullish(),
  // De une à quatre, sans doublon : `isValidPatternList` porte la règle, le
  // schéma ne fait que l appeler pour ne pas la dire deux fois.
  patterns: z
    .array(z.enum(PATTERN_KEYS))
    .refine(isValidPatternList, { message: 'liste de figures invalide' }),
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
export type AddCardBody = z.infer<typeof addCardSchema>;
export type CreateGameBody = z.infer<typeof createGameSchema>;
export type UploadImageBody = z.infer<typeof uploadImageSchema>;

export const gameStatusValues = GAME_STATUSES;
