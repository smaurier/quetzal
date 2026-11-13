import { describe, expect, it } from 'vitest';
import { labelDuParticipant } from './participant-label.js';

/**
 * Dans le domaine et non dans le cas d'usage du retour : l'écran animatrice
 * l'affiche aussi, et un composant client qui importerait le cas d'usage
 * tirerait `@nestjs/common` dans le paquet du navigateur. Une seule règle, pour
 * que le nom projeté pendant la séance soit celui du podium.
 */
describe('labelDuParticipant', () => {
  const base = { participantIndex: 3, name: null, memberNames: [] as string[] };

  it('rend le nom choisi quand il y en a un', () => {
    expect(labelDuParticipant({ ...base, name: 'Les lynx', memberNames: ['Ana', 'Bea'] })).toBe('Les lynx');
  });

  it('ignore un nom choisi fait d espaces', () => {
    expect(labelDuParticipant({ ...base, name: '   ', memberNames: ['Ana'] })).toBe('Ana');
  });

  it('prete le nom du membre unique', () => {
    expect(labelDuParticipant({ ...base, memberNames: ['Dan'] })).toBe('Dan');
  });

  it('rend le numero quand plusieurs membres partagent le participant', () => {
    expect(labelDuParticipant({ ...base, memberNames: ['Ana', 'Bea'] })).toBe('3');
  });

  it('rend le numero quand il n y a aucun membre', () => {
    expect(labelDuParticipant(base)).toBe('3');
  });
});
