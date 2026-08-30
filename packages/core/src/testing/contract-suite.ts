import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { manifestSchema } from '../schemas/manifest.schema.js';
import { CONTRACT_VERSION, type QuetzalModuleManifest } from '../module-contract.js';

function flattenKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  if (!obj || typeof obj !== 'object') return keys;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, key));
    } else {
      keys.push(key);
    }
  }
  return keys.sort();
}

export function runContractSuite(manifest: QuetzalModuleManifest, options: { moduleRoot: string }): void {
  describe(`contract [${manifest.slug}]`, () => {
    it('validates against Zod schema', () => {
      expect(() => manifestSchema.parse(manifest)).not.toThrow();
    });

    it('contract version major matches CONTRACT_VERSION', () => {
      const manifestMajor = manifest.contractVersion.split('.')[0];
      const coreMajor = CONTRACT_VERSION.split('.')[0];
      expect(manifestMajor).toBe(coreMajor);
    });

    it('all published events have canonical naming', () => {
      for (const ev of manifest.eventsPublished) {
        expect(ev.name).toMatch(/^[a-z]+(\.[a-z]+){1,2}$/);
      }
    });

    it('all published events have a type in @quetzal/core/events/<slug>', async () => {
      if (manifest.eventsPublished.length === 0) return;
      const mod = await import(`@quetzal/core/events/${manifest.slug}`).catch(() => null);
      expect(mod, `@quetzal/core/events/${manifest.slug} must exist`).not.toBeNull();
      for (const ev of manifest.eventsPublished) {
        expect(
          (mod as Record<string, unknown>)[ev.typeRef],
          `${ev.typeRef} must be exported from @quetzal/core/events/${manifest.slug}`
        ).toBeDefined();
      }
    });

    it('prisma models are prefixed with <ModulePascalCase>_', async () => {
      if (!manifest.prismaModels) return;
      const path = resolve(options.moduleRoot, manifest.prismaModels);
      const content = await readFile(path, 'utf8');
      const first = manifest.slug[0];
      if (!first) return;
      const prefix = first.toUpperCase() + manifest.slug.slice(1) + '_';
      const models = [...content.matchAll(/model\s+(\w+)/g)]
        .map(m => m[1])
        .filter((m): m is string => !!m);
      for (const m of models) {
        expect(m.startsWith(prefix), `${m} must start with ${prefix}`).toBe(true);
      }
    });

    it('i18n keys have parity across fr/en/es', async () => {
      if (manifest.uiRoutes.length === 0) return;
      const load = (locale: string) =>
        readFile(resolve(options.moduleRoot, `src/i18n/${locale}.json`), 'utf8').then(JSON.parse);
      const [fr, en, es] = await Promise.all(['fr', 'en', 'es'].map(load));
      expect(flattenKeys(en)).toEqual(flattenKeys(fr));
      expect(flattenKeys(es)).toEqual(flattenKeys(fr));
    });

    it('guestAccess coherent with permissions when enabled', () => {
      if (!manifest.guestAccess?.enabled) return;
      const hasGuestEndpoint = Object.values(manifest.permissions).some(roles =>
        (roles as readonly string[]).includes('guest')
      );
      expect(hasGuestEndpoint, 'guestAccess.enabled=true but no permissions entry allows guest').toBe(true);
    });
  });
}
