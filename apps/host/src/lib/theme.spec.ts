import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  colorScheme,
  isThemePreference,
  readThemePreference,
  themeClassName,
} from './theme';

describe('readThemePreference', () => {
  it('rend la préférence écrite dans le cookie', () => {
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference('light')).toBe('light');
  });

  it('retombe sur « système » quand le cookie est absent', () => {
    expect(readThemePreference(undefined)).toBe('system');
    expect(DEFAULT_THEME).toBe('system');
  });

  it('retombe sur « système » sur une valeur inventée, plutôt que de la propager', () => {
    expect(readThemePreference('sombre')).toBe('system');
    expect(readThemePreference('')).toBe('system');
  });
});

describe('themeClassName', () => {
  it('pose .dark et .light pour les choix explicites', () => {
    expect(themeClassName('dark')).toBe('dark');
    expect(themeClassName('light')).toBe('light');
  });

  it("ne pose aucune classe en mode système : c'est la requête média qui décide", () => {
    // Trois valeurs, pas deux. La classe `light` n'est pas décorative : sans
    // elle, @media (prefers-color-scheme: dark) reprendrait la main sur un
    // utilisateur ayant explicitement choisi le mode clair.
    expect(themeClassName('system')).toBe('');
  });
});

describe('colorScheme', () => {
  it('suit le choix explicite, pour que les contrôles natifs suivent aussi', () => {
    expect(colorScheme('dark')).toBe('dark');
    expect(colorScheme('light')).toBe('light');
  });

  it('laisse les deux ouverts en mode système', () => {
    expect(colorScheme('system')).toBe('light dark');
  });
});

describe('isThemePreference', () => {
  it("accepte les trois états et rien d'autre", () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe('THEME_COOKIE', () => {
  it('a un nom stable, lu par la mise en page et écrit par la route', () => {
    expect(THEME_COOKIE).toBe('quetzal-theme');
  });
});
