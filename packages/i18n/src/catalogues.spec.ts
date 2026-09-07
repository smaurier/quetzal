import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, type Locale } from './config.js';

// `runContractSuite` impose déjà la parité des clés aux catalogues de MODULE.
// Les catalogues du noyau n'avaient aucun équivalent — alors que ce sont eux
// qu'on édite le plus souvent, et à la main. Ajouter une clé en français puis
// oublier l'espagnol livre un écran où l'utilisateur lit « common.theme.system »
// en toutes lettres.
function load(locale: Locale): Record<string, unknown> {
  const path = fileURLToPath(new URL(`../catalogues/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function flatten(value: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      for (const [k, v] of flatten(child as Record<string, unknown>, path)) out.set(k, v);
    } else {
      out.set(path, child);
    }
  }
  return out;
}

const REFERENCE = flatten(load(DEFAULT_LOCALE));
const OTHERS = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe('catalogues du noyau', () => {
  it('la référence est non vide, sinon les tests suivants ne prouveraient rien', () => {
    expect(REFERENCE.size).toBeGreaterThan(0);
  });

  describe.each(OTHERS)('%s', (locale) => {
    const translated = flatten(load(locale));

    it('ne laisse aucune clé de la référence sans traduction', () => {
      const missing = [...REFERENCE.keys()].filter((key) => !translated.has(key));
      expect(missing).toEqual([]);
    });

    it("n'invente aucune clé absente de la référence", () => {
      // Une clé en trop n'est pas anodine : elle signale soit une faute de
      // frappe, soit une clé renommée dans la référence sans l'être ici.
      const extra = [...translated.keys()].filter((key) => !REFERENCE.has(key));
      expect(extra).toEqual([]);
    });

    it('ne contient aucune valeur vide, qui passerait la parité sans rien dire', () => {
      const empty = [...translated.entries()]
        .filter(([, value]) => typeof value === 'string' && value.trim() === '')
        .map(([key]) => key);
      expect(empty).toEqual([]);
    });
  });
});
