import { describe, it, expect } from 'vitest';
import { FORCED_LOCALE_HEADER, readForcedLocale } from './forced-locale';

describe('readForcedLocale', () => {
  it('accepte les langues connues', () => {
    expect(readForcedLocale('es')).toBe('es');
    expect(readForcedLocale('fr')).toBe('fr');
    expect(readForcedLocale('en')).toBe('en');
  });

  it('rejette une langue inconnue plutôt que de la propager', () => {
    expect(readForcedLocale('de')).toBeNull();
    expect(readForcedLocale('')).toBeNull();
  });

  it("rejette l'absence de valeur", () => {
    expect(readForcedLocale(null)).toBeNull();
    expect(readForcedLocale(undefined)).toBeNull();
  });

  it("refuse ce qui s'échapperait de l'attribut lang", () => {
    // Cette valeur arrive de l'URL, donc d'un inconnu. Sans liste blanche
    // elle atterrirait dans <html lang="…"> et en sortirait.
    expect(readForcedLocale('fr" onload="alert(1)')).toBeNull();
    expect(readForcedLocale('"><script>')).toBeNull();
    expect(readForcedLocale('fr es')).toBeNull();
  });

  it("porte un nom d'en-tête stable, posé par le middleware et lu par i18n", () => {
    expect(FORCED_LOCALE_HEADER).toBe('x-forced-locale');
  });
});
