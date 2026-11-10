import { describe, it, expect } from 'vitest';
import { normaliser, type ReglesDeSaisie } from './normalisation';

const TOUT_SENSIBLE: ReglesDeSaisie = { accentsSensibles: true, casseSensible: true };
const TOUT_TOLERANT: ReglesDeSaisie = { accentsSensibles: false, casseSensible: false };

/**
 * Décision D2 de la spec : le pardon est EXPLICITE, jamais statistique. Deux
 * drapeaux, et rien d'autre, aucune distance d'édition, parce qu'une distance
 * de un traite `esta`/`está` (faute d'accent, peut-être pardonnable) et
 * `casa`/`cosa` (deux mots différents) exactement pareil.
 */
describe('normaliser', () => {
  it('coupe les blancs autour, toujours', () => {
    expect(normaliser('  la casa  ', TOUT_SENSIBLE)).toBe('la casa');
  });

  it('reduit les blancs internes multiples a un seul', () => {
    expect(normaliser('la    casa', TOUT_SENSIBLE)).toBe('la casa');
  });

  it('garde les accents quand ils sont sensibles', () => {
    expect(normaliser('está', TOUT_SENSIBLE)).toBe('está');
  });

  it('retire les accents quand ils ne le sont pas', () => {
    expect(normaliser('está', { accentsSensibles: false, casseSensible: true })).toBe('esta');
  });

  it('garde la casse quand elle est sensible', () => {
    expect(normaliser('Casa', TOUT_SENSIBLE)).toBe('Casa');
  });

  it('abaisse la casse quand elle ne l est pas', () => {
    expect(normaliser('Casa', { accentsSensibles: true, casseSensible: false })).toBe('casa');
  });

  it('ne confond JAMAIS deux mots differents, quels que soient les drapeaux', () => {
    expect(normaliser('casa', TOUT_TOLERANT)).not.toBe(normaliser('cosa', TOUT_TOLERANT));
  });

  it('rend esta et está identiques quand les accents sont tolerés', () => {
    expect(normaliser('está', TOUT_TOLERANT)).toBe(normaliser('ESTA', TOUT_TOLERANT));
  });

  it('ne touche pas au tilde du n, qui est une lettre et non un accent', () => {
    // `ñ` est une lettre de l alphabet espagnol, pas un `n` accentué. La
    // confondre avec `n` ferait accepter `ano` pour `año`, ce qui n est pas une
    // tolérance mais une faute de sens.
    expect(normaliser('año', TOUT_TOLERANT)).toBe('año');
  });
});
