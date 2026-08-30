export const LOCALES = ['fr', 'en', 'es'] as const;
export type Locale = typeof LOCALES[number];
export const DEFAULT_LOCALE: Locale = 'fr';
