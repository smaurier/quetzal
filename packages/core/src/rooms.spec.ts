import { describe, it, expect } from 'vitest';
import { rooms } from './rooms.js';

describe('rooms', () => {
  it('formats session room canonically', () => {
    expect(rooms.session('hello', 'abc123')).toBe('hello:session:abc123');
  });

  it('formats tenant room canonically', () => {
    expect(rooms.tenant('loto', 't-A')).toBe('loto:tenant:t-A');
  });
});

describe('rooms.subgroup', () => {
  it('dérive un salon plus fin à l intérieur d une session', () => {
    expect(rooms.subgroup('loto', 'game-1', 'team-2')).toBe('loto:session:game-1:team-2');
  });

  it('reste préfixé par le salon de session, pour que le module ne puisse pas viser ailleurs', () => {
    expect(rooms.subgroup('loto', 'game-1', 'team-2')).toContain(rooms.session('loto', 'game-1'));
  });
});
