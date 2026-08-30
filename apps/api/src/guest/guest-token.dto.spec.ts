import { describe, it, expect } from 'vitest';
import { guestTokenRequestSchema } from './guest-token.dto';

const valid = {
  tenantId: '01930000-0000-7000-8000-000000000000',
  sessionId: 's-abc',
  moduleSlug: 'hello',
  displayName: 'Bob',
};

describe('guestTokenRequestSchema', () => {
  it('accepts a valid request', () => {
    expect(() => guestTokenRequestSchema.parse(valid)).not.toThrow();
  });

  it('rejects non-uuid tenantId', () => {
    expect(() => guestTokenRequestSchema.parse({ ...valid, tenantId: 'not-a-uuid' })).toThrow();
  });

  it('rejects invalid moduleSlug (uppercase)', () => {
    expect(() => guestTokenRequestSchema.parse({ ...valid, moduleSlug: 'Hello' })).toThrow();
  });

  it('rejects empty displayName', () => {
    expect(() => guestTokenRequestSchema.parse({ ...valid, displayName: '' })).toThrow();
  });

  it('rejects displayName over 32 chars', () => {
    expect(() => guestTokenRequestSchema.parse({ ...valid, displayName: 'x'.repeat(33) })).toThrow();
  });
});
