import { describe, it, expect, beforeAll } from 'vitest';
import { signGuestToken, verifyGuestToken, GuestTokenInvalidError } from './guest-token.js';

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = 'x'.repeat(64);
});

describe('guest-token', () => {
  const payload = {
    tenantId: 't-A',
    sessionId: 's-1',
    guestId: 'g-1',
    displayName: 'Bob',
    moduleSlug: 'hello',
  };

  it('signs and verifies a valid token', async () => {
    const token = await signGuestToken(payload, 3600);
    const verified = await verifyGuestToken(token);
    expect(verified.tenantId).toBe('t-A');
    expect(verified.displayName).toBe('Bob');
  });

  it('rejects tampered token', async () => {
    const token = await signGuestToken(payload, 3600);
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(verifyGuestToken(tampered)).rejects.toThrow(GuestTokenInvalidError);
  });

  it('rejects expired token', async () => {
    const token = await signGuestToken(payload, -1);
    await expect(verifyGuestToken(token)).rejects.toThrow(GuestTokenInvalidError);
  });
});
