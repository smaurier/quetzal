import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RequestMethod, type Type } from '@nestjs/common';
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { manifestSchema } from '../schemas/manifest.schema.js';
import { CONTRACT_VERSION, type QuetzalModuleManifest } from '../module-contract.js';

function isType(value: unknown): value is Type<unknown> {
  return typeof value === 'function';
}

// Nest accepts a single path or an array of paths on both @Controller and
// @Get/@Post/etc; anything else means the decorator was never applied.
function toPathList(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((v): v is string => typeof v === 'string')) return value;
  return ['/'];
}

function joinRoutePath(prefix: string, path: string): string {
  const segments = [prefix, path]
    .map(segment => segment.replace(/^\/+|\/+$/g, ''))
    .filter(segment => segment.length > 0);
  return `/${segments.join('/')}`;
}

// METHOD_METADATA is only ever set by @Get/@Post/etc, so its presence (not
// just its value) is what tells a route handler apart from a plain method.
function isHttpMethodCode(value: unknown): value is RequestMethod {
  return typeof value === 'number' && RequestMethod[value] !== undefined;
}

interface ControllerRoute {
  readonly httpMethod: string;
  readonly path: string;
}

function getControllerClasses(apiModule: Type<unknown>): readonly Type<unknown>[] {
  // Nest stores a @Module()'s controller classes as reflect-metadata on the
  // module class itself; there is no typed accessor for it outside the
  // framework's own DI container, so the runtime shape is `unknown` until
  // narrowed here.
  const raw: unknown = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, apiModule);
  return Array.isArray(raw) ? raw.filter(isType) : [];
}

function getControllerRoutes(controller: Type<unknown>): readonly ControllerRoute[] {
  const prefixes = toPathList(Reflect.getMetadata(PATH_METADATA, controller) as unknown);
  const proto = controller.prototype as Record<string, unknown>;
  const routes: ControllerRoute[] = [];

  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const handler = proto[name];
    if (typeof handler !== 'function') continue;

    const methodCode: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
    if (!isHttpMethodCode(methodCode)) continue; // not an HTTP route handler

    const handlerPaths = toPathList(Reflect.getMetadata(PATH_METADATA, handler) as unknown);
    const httpMethod = RequestMethod[methodCode];
    for (const prefix of prefixes) {
      for (const handlerPath of handlerPaths) {
        routes.push({ httpMethod, path: joinRoutePath(prefix, handlerPath) });
      }
    }
  }
  return routes;
}

// The matrix declares routes, not parameter spellings (a controller may write
// :deckId while the matrix says :id for the same route) — so both sides are
// compared with every :segment collapsed to a common placeholder.
function normalizeRouteParams(routeKey: string): string {
  return routeKey.replace(/:[^/\s]+/g, ':param');
}

export function findUndeclaredControllerRoutes(manifest: QuetzalModuleManifest): readonly string[] {
  const declaredKeys = Object.keys(manifest.permissions).filter(key => key.startsWith('http:'));
  const normalizedDeclared = new Set(declaredKeys.map(normalizeRouteParams));

  const missing: string[] = [];
  for (const controller of getControllerClasses(manifest.apiModule)) {
    for (const route of getControllerRoutes(controller)) {
      const key = `http:${route.httpMethod} ${route.path}`;
      if (!normalizedDeclared.has(normalizeRouteParams(key))) {
        missing.push(key);
      }
    }
  }
  return missing;
}

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
        expect(ev.name).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){1,2}$/);
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

    it('every controller route is declared in permissions', () => {
      const missing = findUndeclaredControllerRoutes(manifest);
      const declared = Object.keys(manifest.permissions).filter(key => key.startsWith('http:'));
      const message =
        'Controller exposes route(s) not declared in manifest.permissions:\n' +
        (missing.length > 0 ? missing.map(key => `  - ${key}`).join('\n') : '  (none)') +
        '\n\nmanifest.permissions currently declares:\n' +
        (declared.length > 0 ? declared.map(key => `  - ${key}`).join('\n') : '  (none)');
      expect(missing, message).toEqual([]);
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
