import { z } from 'zod';

export const guestTokenRequestSchema = z.object({
  tenantId: z.string().uuid(),
  sessionId: z.string().min(1),
  moduleSlug: z.string().regex(/^[a-z][a-z0-9-]{2,31}$/),
  displayName: z.string().min(1).max(32),
});

export type GuestTokenRequest = z.infer<typeof guestTokenRequestSchema>;
