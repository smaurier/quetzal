import { describe, it, expect } from 'vitest';
import { modelHasTenantId } from './model-tenant-lookup.js';
import { UnknownTenantModelError } from './errors.js';

// Fixed literal registry — this module must be testable without depending on
// the generated (gitignored) model-tenant-registry.ts output.
const REGISTRY = {
  loto_Game: true,
  user: false,
} as const;

describe('modelHasTenantId', () => {
  it('returns true for a model known to have tenantId', () => {
    expect(modelHasTenantId('loto_Game', REGISTRY)).toBe(true);
  });

  it('returns false for a model known not to have tenantId (Better-Auth user)', () => {
    expect(modelHasTenantId('user', REGISTRY)).toBe(false);
  });

  it('throws UnknownTenantModelError for a model absent from the registry', () => {
    let thrown: unknown;
    try {
      modelHasTenantId('madeUpModel', REGISTRY);
    } catch (e) {
      thrown = e;
    }
    // Deliberately not `.toThrow(UnknownTenantModelError)`: if that export
    // does not exist yet, the import binds `undefined` and `.toThrow(undefined)`
    // degrades to a bare "did it throw at all" check that passes by accident.
    // `toBeInstanceOf` on an undefined ctor throws a genuine TypeError instead.
    expect(thrown).toBeInstanceOf(UnknownTenantModelError);
  });

  it('names the offending model and the remedy build command in the message', () => {
    let thrown: unknown;
    try {
      modelHasTenantId('madeUpModel', REGISTRY);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).message).toContain('madeUpModel');
    expect((thrown as Error).message).toContain('pnpm --filter @quetzal/db build');
  });
});
