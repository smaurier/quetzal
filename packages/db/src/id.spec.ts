import { describe, it, expect } from 'vitest';
import { newId } from './id.js';

describe('newId', () => {
  it('returns a UUID v7 string (36 chars, hyphenated)', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('generates chronologically ordered IDs (v7 property)', () => {
    const a = newId();
    const b = newId();
    expect(b >= a).toBe(true);
  });
});
