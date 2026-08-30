import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { redactUser } from './logger.js';

describe('redactUser', () => {
  it('returns 16-char sha256 prefix', () => {
    const result = redactUser({ id: 'user-abc' });
    const expected = createHash('sha256').update('user-abc').digest('hex').slice(0, 16);
    expect(result).toEqual({ userIdHash: expected });
    expect(result.userIdHash).toHaveLength(16);
  });

  it('is deterministic (same id → same hash)', () => {
    expect(redactUser({ id: 'x' })).toEqual(redactUser({ id: 'x' }));
  });

  it('produces different hashes for different ids', () => {
    expect(redactUser({ id: 'a' }).userIdHash).not.toBe(redactUser({ id: 'b' }).userIdHash);
  });

  it('does not leak the raw id', () => {
    const rawId = 'sensitive-user-42';
    const { userIdHash } = redactUser({ id: rawId });
    expect(userIdHash).not.toContain('sensitive');
    expect(userIdHash).not.toContain('42');
  });
});
