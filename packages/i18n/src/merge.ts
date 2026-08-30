#!/usr/bin/env tsx
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const CATALOGUES_DIR = resolve(import.meta.dirname, '../catalogues');
const LOCALES = ['fr', 'en', 'es'] as const;

type Catalogue = Record<string, unknown>;

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
    const merged: Catalogue = { ...core };
    for (const slug of moduleSlugs) {
      const modCat = await loadModuleCatalogue(slug, locale);
      if (modCat) Object.assign(merged, modCat);
    }
    const out = join(CATALOGUES_DIR, `merged.${locale}.json`);
    await writeFile(out, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[i18n:merge] wrote ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
