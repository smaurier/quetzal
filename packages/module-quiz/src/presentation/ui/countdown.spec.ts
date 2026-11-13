import { describe, it, expect } from 'vitest';
import { JALONS_SECONDES, jalonAtteint, secondesRestantes } from './countdown.js';

/**
 * Spec §8 point 2 : « Minuteur annonce, pas seulement affiche ». Un decompte
 * uniquement visuel est INVISIBLE a un lecteur d'ecran, et le contenu d'un
 * `role="status"` qui change chaque seconde est pire que rien : il noie
 * l'utilisateur sous trente annonces.
 *
 * D'ou des JALONS. Et cette partie est pure, donc testable sans navigateur.
 *
 * Ecrit par la tache 17 du plan, avance a la tache 16 : D8 met le decompte
 * dans le navigateur de l'animatrice, c'est donc son ecran qui en a besoin le
 * premier.
 */
describe('secondesRestantes', () => {
  it('rend le temps restant, arrondi vers le haut', () => {
    expect(secondesRestantes(10_400, 0)).toBe(11);
  });

  it('ne rend jamais de valeur negative', () => {
    expect(secondesRestantes(1_000, 9_000)).toBe(0);
  });

  it('rend zero pile a l echeance', () => {
    expect(secondesRestantes(5_000, 5_000)).toBe(0);
  });
});

describe('jalonAtteint', () => {
  it('annonce aux jalons de la spec, et nulle part ailleurs', () => {
    expect([...JALONS_SECONDES]).toEqual([30, 20, 10, 5, 3, 2, 1]);
    expect(jalonAtteint(10, 11)).toBe(10);
    expect(jalonAtteint(5, 6)).toBe(5);
  });

  /**
   * ⛔ LE PIEGE. Sans ce garde, un `role="status"` reannonce a chaque rendu
   * React, et React rend plusieurs fois par seconde. Un lecteur d'ecran
   * repeterait « dix secondes » en boucle, ce qui est PIRE qu'un decompte muet.
   */
  it('n annonce pas deux fois le meme jalon', () => {
    expect(jalonAtteint(10, 10)).toBeNull();
  });

  it('n annonce rien entre deux jalons', () => {
    expect(jalonAtteint(15, 16)).toBeNull();
    expect(jalonAtteint(8, 9)).toBeNull();
  });

  /**
   * ⛔ Un saut de plusieurs jalons doit annoncer le PLUS BAS atteint, et un
   * seul. Une page mise en arriere-plan par le navigateur gele ses minuteurs :
   * au retour, dix secondes ont pu passer d'un coup.
   */
  it('annonce le jalon le plus bas quand plusieurs sont franchis d un coup', () => {
    expect(jalonAtteint(4, 12)).toBe(5);
  });

  it('n annonce rien au-dessus du premier jalon', () => {
    expect(jalonAtteint(45, 60)).toBeNull();
  });

  it('n annonce rien quand il n y a aucun minuteur', () => {
    expect(jalonAtteint(null, null)).toBeNull();
  });
});
