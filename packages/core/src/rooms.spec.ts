import { describe, it, expect } from 'vitest';
import { rooms } from './rooms';

describe('rooms', () => {
  it('formats session room canonically', () => {
    expect(rooms.session('hello', 'abc123')).toBe('hello:session:abc123');
  });

  it('formats tenant room canonically', () => {
    expect(rooms.tenant('loto', 't-A')).toBe('loto:tenant:t-A');
  });
});
