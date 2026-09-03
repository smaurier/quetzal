import { describe, it, expect } from 'vitest';
import type { QuetzalModuleManifest } from '@quetzal/core';
import { moduleSlugFromNamespace, buildWsRegistry } from './ws-policies';

function manifest(slug: string, guests: boolean): QuetzalModuleManifest {
  return {
    slug,
    permissions: { [`ws:ping`]: ['owner', 'guest'] },
    ...(guests ? { guestAccess: { enabled: true, tokenTTL: 60, requireDisplayName: true, maxConcurrentPerSession: 10 } } : {}),
  } as unknown as QuetzalModuleManifest;
}

// Convention §7: a module gateway lives at /ws/<slug>. The platform derives what each
// namespace accepts from the manifest; a module declares nothing extra.
describe('moduleSlugFromNamespace', () => {
  it('extracts the slug of a module namespace', () => {
    expect(moduleSlugFromNamespace('/ws/hello')).toBe('hello');
    expect(moduleSlugFromNamespace('ws/hello')).toBe('hello');
  });

  it('ignores namespaces outside the module convention', () => {
    expect(moduleSlugFromNamespace('/')).toBeNull();
    expect(moduleSlugFromNamespace('/admin')).toBeNull();
    expect(moduleSlugFromNamespace('/ws/hello/extra')).toBeNull();
  });
});

describe('buildWsRegistry', () => {
  it('allows guests only when the manifest enables guest access', () => {
    const registry = buildWsRegistry([manifest('hello', true), manifest('quiz', false)]);
    expect(registry.policy('/ws/hello')).toEqual({ moduleSlug: 'hello', allowGuests: true });
    expect(registry.policy('/ws/quiz')).toEqual({ moduleSlug: 'quiz', allowGuests: false });
  });

  it('has no policy for an unknown namespace', () => {
    const registry = buildWsRegistry([manifest('hello', true)]);
    expect(registry.policy('/ws/loto')).toBeNull();
    expect(registry.policy('/')).toBeNull();
  });

  it('exposes the permission matrix of the owning module', () => {
    const registry = buildWsRegistry([manifest('hello', true)]);
    expect(registry.permissions('/ws/hello')).toEqual({ 'ws:ping': ['owner', 'guest'] });
    expect(registry.permissions('/ws/loto')).toBeNull();
  });
});
