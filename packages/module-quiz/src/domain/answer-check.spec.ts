import { describe, it, expect } from 'vitest';
import { estJuste, type QuestionJouable } from './answer-check';

const CHOIX: QuestionJouable = {
  answerMode: 'choix',
  options: [
    { id: 'o-1', isCorrect: false },
    { id: 'o-2', isCorrect: true },
    { id: 'o-3', isCorrect: false },
  ],
};

const SAISIE: QuestionJouable = {
  answerMode: 'saisie',
  /**
   * ⛔ LA TROISIÈME VARIANTE EST ÉCRITE NON CANONIQUE, ET C'EST TOUT L'OBJET.
   *
   * Avec seulement `['la casa', 'el hogar']`, déjà en minuscules et sans
   * accent, normaliser le côté ACCEPTÉ est une non-opération : la mutation qui
   * retire cette normalisation reste alors VERTE, et le test censé garder la
   * symétrie ne garde rien. Mesuré le 10/11.
   *
   * `La Morada` porte une majuscule, donc une saisie canonique ne peut la
   * rejoindre que si les deux côtés sont normalisés.
   */
  acceptedAnswers: ['la casa', 'el hogar', 'La Morada'],
  regles: { accentsSensibles: false, casseSensible: false },
};

/**
 * § 5.2 de la spec : la seule règle qui décide juste ou faux, et elle est pure.
 * Le serveur ne tient aucun compte de ce que le client affirme sur sa propre
 * justesse : D5 de la spec reprend « le serveur ne fait jamais confiance au
 * marquage du client » (D1 du loto). Ce fichier est donc le seul juge.
 */
describe('estJuste, mode choix', () => {
  it('accepte l identifiant de la proposition juste', () => {
    expect(estJuste(CHOIX, { optionId: 'o-2' })).toBe(true);
  });

  it('refuse l identifiant d une proposition fausse', () => {
    expect(estJuste(CHOIX, { optionId: 'o-1' })).toBe(false);
  });

  it('refuse un identifiant qui n appartient pas a la question', () => {
    expect(estJuste(CHOIX, { optionId: 'o-dune-autre-question' })).toBe(false);
  });

  it('refuse une saisie envoyee a une question a choix', () => {
    expect(estJuste(CHOIX, { texte: 'o-2' })).toBe(false);
  });
});

describe('estJuste, mode saisie', () => {
  it('accepte une reponse listee', () => {
    expect(estJuste(SAISIE, { texte: 'la casa' })).toBe(true);
  });

  it('accepte une seconde variante listee', () => {
    expect(estJuste(SAISIE, { texte: 'el hogar' })).toBe(true);
  });

  it('normalise la SAISIE, donc une majuscule accentuee rejoint une acceptee canonique', () => {
    expect(estJuste(SAISIE, { texte: '  LA   CÁSA ' })).toBe(true);
  });

  /**
   * ⛔ ET L AUTRE SENS, qui est celui qu on oublie. `La Morada` est stockee avec
   * une majuscule, donc une saisie deja canonique ne peut la rejoindre que si le
   * cote ACCEPTE est normalise lui aussi.
   *
   * Sans ce test, la mutation qui retire la normalisation du cote accepte reste
   * VERTE : toutes les autres variantes du fixture sont deja canoniques, donc la
   * normaliser ne change rien. Un garde qu on n a pas vu rougir ne garde rien.
   */
  it('normalise AUSSI le cote accepte, pas seulement la saisie', () => {
    expect(estJuste(SAISIE, { texte: 'la morada' })).toBe(true);
  });

  it('refuse un mot different', () => {
    expect(estJuste(SAISIE, { texte: 'la cosa' })).toBe(false);
  });

  it('refuse une reponse vide', () => {
    expect(estJuste(SAISIE, { texte: '   ' })).toBe(false);
  });

  it('refuse un identifiant de proposition envoye a une question en saisie', () => {
    expect(estJuste(SAISIE, { optionId: 'o-2' })).toBe(false);
  });

  it('respecte les drapeaux : accents sensibles refusent la variante', () => {
    const stricte: QuestionJouable = {
      answerMode: 'saisie',
      acceptedAnswers: ['está'],
      regles: { accentsSensibles: true, casseSensible: true },
    };
    expect(estJuste(stricte, { texte: 'está' })).toBe(true);
    expect(estJuste(stricte, { texte: 'esta' })).toBe(false);
  });
});
