export const THEME_COOKIE = 'quetzal-theme';
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export const DEFAULT_THEME: ThemePreference = 'system';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: string | undefined): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function readThemePreference(cookieValue: string | undefined): ThemePreference {
  return isThemePreference(cookieValue) ? cookieValue : DEFAULT_THEME;
}

// Trois valeurs et non deux. En mode système on ne pose aucune classe et on
// laisse @media (prefers-color-scheme: dark) décider ; la classe `light` sert
// à lui retirer la main quand l'utilisateur a explicitement choisi le clair.
export function themeClassName(preference: ThemePreference): string {
  return preference === 'system' ? '' : preference;
}

// Sans color-scheme, les ascenseurs, cases à cocher et menus déroulants natifs
// restent clairs sur un fond sombre.
export function colorScheme(preference: ThemePreference): string {
  return preference === 'system' ? 'light dark' : preference;
}
