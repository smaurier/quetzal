import { LOCALES, type Locale } from '@quetzal/i18n';

export const FORCED_LOCALE_HEADER = 'x-forced-locale';

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// La valeur vient du paramètre `lang` de l'URL d'entrée invité, donc d'une
// source non fiable. Liste blanche obligatoire : une chaîne arbitraire
// recopiée dans <html lang="…"> s'en échapperait.
export function readForcedLocale(value: string | null | undefined): Locale | null {
  if (typeof value !== 'string') return null;
  return isLocale(value) ? value : null;
}
