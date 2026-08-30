import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGuestRegistry } from './guest-registry.js';

describe('InMemoryGuestRegistry', () => {
  let registry: InMemoryGuestRegistry;

  beforeEach(() => {
    registry = new InMemoryGuestRegistry();
  });

  const guest = (id: string, name = `Guest ${id}`) => ({
    guestId: id,
    displayName: name,
    joinedAt: Date.now(),
  });

  describe('add', () => {
    it('registers a new guest without throwing', () => {
      expect(() => registry.add('hello', 's-1', guest('g-1'))).not.toThrow();
      expect(registry.count('hello', 's-1')).toBe(1);
    });

    it('overwrites entry when same guestId is added twice', () => {
      registry.add('hello', 's-1', guest('g-1', 'Alice'));
      registry.add('hello', 's-1', guest('g-1', 'Alice-renamed'));
      expect(registry.count('hello', 's-1')).toBe(1);
      expect(registry.list('hello', 's-1')[0]?.displayName).toBe('Alice-renamed');
    });
  });

  describe('count', () => {
    it('returns 0 for an unseen session', () => {
      expect(registry.count('hello', 's-unknown')).toBe(0);
    });

    it('reflects added guests', () => {
      registry.add('hello', 's-1', guest('g-1'));
      registry.add('hello', 's-1', guest('g-2'));
      expect(registry.count('hello', 's-1')).toBe(2);
    });
  });

  describe('list', () => {
    it('returns an empty array for an unseen session', () => {
      expect(registry.list('hello', 's-unknown')).toEqual([]);
    });

    it('returns all guests in insertion order', () => {
      registry.add('hello', 's-1', guest('g-1'));
      registry.add('hello', 's-1', guest('g-2'));
      const ids = registry.list('hello', 's-1').map(g => g.guestId);
      expect(ids).toEqual(['g-1', 'g-2']);
    });
  });

  describe('remove', () => {
    it('removes an existing guest', () => {
      registry.add('hello', 's-1', guest('g-1'));
      registry.remove('hello', 's-1', 'g-1');
      expect(registry.count('hello', 's-1')).toBe(0);
    });

    it('is a no-op for an unknown session', () => {
      expect(() => registry.remove('hello', 's-unknown', 'g-1')).not.toThrow();
    });

    it('is a no-op for an unknown guest in a known session', () => {
      registry.add('hello', 's-1', guest('g-1'));
      registry.remove('hello', 's-1', 'g-unknown');
      expect(registry.count('hello', 's-1')).toBe(1);
    });
  });

  describe('key isolation', () => {
    it('isolates guests by (moduleSlug, sessionId) pair', () => {
      registry.add('hello', 's-1', guest('g-1'));
      registry.add('hello', 's-2', guest('g-1'));
      registry.add('loto',  's-1', guest('g-1'));
      expect(registry.count('hello', 's-1')).toBe(1);
      expect(registry.count('hello', 's-2')).toBe(1);
      expect(registry.count('loto',  's-1')).toBe(1);
    });

    it('remove in one session does not affect others', () => {
      registry.add('hello', 's-1', guest('g-1'));
      registry.add('hello', 's-2', guest('g-1'));
      registry.remove('hello', 's-1', 'g-1');
      expect(registry.count('hello', 's-1')).toBe(0);
      expect(registry.count('hello', 's-2')).toBe(1);
    });
  });
});
