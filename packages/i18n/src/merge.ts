#!/usr/bin/env tsx
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const CATALOGUES_DIR = resolve(import.meta.dirname, '../catalogues');
const LOCALES = ['fr', 'en', 'es'] as const;

export type Catalogue = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return out;
}

export function mergeCatalogues(core: Catalogue, moduleCats: readonly Catalogue[]): Catalogue {
  return moduleCats.reduce<Catalogue>((acc, cat) => deepMerge(acc, cat), deepMerge({}, core));
}

async function loadCoreCatalogue(locale: string): Promise<Catalogue> {
  const path = join(CATALOGUES_DIR, `${locale}.json`);
  return JSON.parse(await readFile(path, 'utf8')) as Catalogue;
}

async function loadModuleCatalogue(slug: string, locale: string): Promise<Catalogue | null> {
  const path = join(ROOT, 'packages', `module-${slug}`, 'src', 'i18n', `${locale}.json`);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Catalogue;
  } catch {
    return null;
  }
}

async function main() {
  const packagesDir = resolve(ROOT, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const moduleSlugs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('module-'))
    .map((e) => e.name.replace(/^module-/, ''));

  for (const locale of LOCALES) {
    const core = await loadCoreCatalogue(locale);
    const moduleCats: Catalogue[] = [];
    for (const slug of moduleSlugs) {
      const modCat = await loadModuleCatalogue(slug, locale);
      if (modCat) moduleCats.push(modCat);
    }
    const merged = mergeCatalogues(core, moduleCats);
    const out = join(CATALOGUES_DIR, `merged.${locale}.json`);
    await writeFile(out, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[i18n:merge] wrote ${out}`);
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
