import { describe, it, expect } from 'vitest';
import { manifestSchema } from './manifest.schema';

const baseValidManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
  description: { fr: 'Test', en: 'Test', es: 'Test' },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: class {},
  eventsPublished: [],
  uiRoutes: [],
  navItem: null,
  permissions: {},
};

describe('manifestSchema', () => {
  it('accepts valid manifest', () => {
    expect(() => manifestSchema.parse(baseValidManifest)).not.toThrow();
  });

  it('rejects invalid slug (uppercase)', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, slug: 'Hello' })).toThrow();
  });

  it('rejects invalid slug (starts with digit)', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, slug: '1hello' })).toThrow();
  });

  it('rejects invalid slug (too short)', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, slug: 'ab' })).toThrow();
  });

  it('rejects missing locale in name', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, name: { fr: 'x' } as any })).toThrow();
  });

  it('rejects invalid contractVersion format', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, contractVersion: '1.0' })).toThrow();
  });

  it('rejects invalid version format', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, version: 'v1' })).toThrow();
  });
});
