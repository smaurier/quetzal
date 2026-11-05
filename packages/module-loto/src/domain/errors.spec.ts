import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core/errors';
import {
  DeckTooSmallError,
  InvalidGameTransitionError,
  TeamBlockedError,
  GameNotRunningError,
  InvalidTeamLimitError,
  TablaGenerationExhaustedError,
  DeckNotFoundError,
  GameNotFoundError,
  JoinCodeUnavailableError,
  NoCardsLeftError,
  DeckLockedError,
  CardNotOnTablaError,
  TeamNotFoundError,
  TeamIndexCollisionError,
  InvalidPatternListError,
  PatternIndexOutOfRangeError,
  UnknownGameStatusError,
} from './errors.js';

describe('erreurs du domaine loto', () => {
  it('héritent toutes de DomainError du noyau', () => {
    expect(new DeckTooSmallError(9)).toBeInstanceOf(DomainError);
    expect(new InvalidGameTransitionError('draft', 'finished')).toBeInstanceOf(DomainError);
    expect(new TeamBlockedError(15)).toBeInstanceOf(DomainError);
    expect(new GameNotRunningError('open')).toBeInstanceOf(DomainError);
    expect(new InvalidTeamLimitError(0)).toBeInstanceOf(DomainError);
    expect(new TablaGenerationExhaustedError(6, 100)).toBeInstanceOf(DomainError);
  });

  it('portent leur nom de classe, pour que le filtre global les distingue', () => {
    expect(new DeckTooSmallError(9).name).toBe('DeckTooSmallError');
    expect(new InvalidTeamLimitError(0).name).toBe('InvalidTeamLimitError');
    expect(new TablaGenerationExhaustedError(6, 100).name).toBe('TablaGenerationExhaustedError');
  });

  it('donnent le contexte utile dans le message', () => {
    expect(new DeckTooSmallError(9).message).toContain('9');
    expect(new DeckTooSmallError(9).message).toContain('16');
    expect(new InvalidGameTransitionError('draft', 'finished').message).toContain('draft');
    expect(new TeamBlockedError(15).message).toContain('15');
    expect(new InvalidTeamLimitError(0).message).toContain('0');
    expect(new InvalidTeamLimitError(-1).message).toContain('-1');
    expect(new TablaGenerationExhaustedError(6, 100).message).toContain('6');
    expect(new TablaGenerationExhaustedError(6, 100).message).toContain('100');
  });
});

describe('erreurs des cas d usage', () => {
  it('héritent toutes de DomainError du noyau', () => {
    expect(new DeckNotFoundError('d-1')).toBeInstanceOf(DomainError);
    expect(new GameNotFoundError('g-1')).toBeInstanceOf(DomainError);
    expect(new JoinCodeUnavailableError(20)).toBeInstanceOf(DomainError);
    expect(new NoCardsLeftError('g-1')).toBeInstanceOf(DomainError);
    expect(new DeckLockedError('d-1')).toBeInstanceOf(DomainError);
  });

  it('portent leur nom de classe', () => {
    expect(new DeckLockedError('d-1').name).toBe('DeckLockedError');
  });

  it('donnent le contexte utile dans le message', () => {
    expect(new DeckNotFoundError('d-1').message).toContain('d-1');
    expect(new GameNotFoundError('g-1').message).toContain('g-1');
    expect(new JoinCodeUnavailableError(20).message).toContain('20');
    expect(new NoCardsLeftError('g-1').message).toContain('g-1');
    expect(new DeckLockedError('d-1').message).toContain('d-1');
  });

  it('couvre aussi la carte hors tabla et l équipe inconnue', () => {
    expect(new CardNotOnTablaError('c-9')).toBeInstanceOf(DomainError);
    expect(new TeamNotFoundError('t-9')).toBeInstanceOf(DomainError);
    expect(new CardNotOnTablaError('c-9').message).toContain('c-9');
    expect(new TeamNotFoundError('t-9').message).toContain('t-9');
  });

  it('signale la collision d index d équipe, pour que le cas d usage la distingue d une vraie panne', () => {
    const err = new TeamIndexCollisionError('g-1', 0);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe('TeamIndexCollisionError');
    expect(err.message).toContain('g-1');
    expect(err.message).toContain('0');
  });
});

describe('erreurs d infrastructure', () => {
  it('InvalidPatternListError ne descend PAS de DomainError, pour que le filtre global la traite en panne et non en regle metier', () => {
    const err = new InvalidPatternListError('lecture', '""', 'liste vide');
    expect(err).not.toBeInstanceOf(DomainError);
    expect(err.name).toBe('InvalidPatternListError');
  });

  it('PatternIndexOutOfRangeError ne descend PAS de DomainError, pour que le filtre la traite en panne', () => {
    const err = new PatternIndexOutOfRangeError(5, 3);
    expect(err).not.toBeInstanceOf(DomainError);
    expect(err.name).toBe('PatternIndexOutOfRangeError');
    expect(err.message).toMatch(/5 sur 3/);
  });

  it('UnknownGameStatusError ne descend PAS de DomainError, pour que le filtre global la traite en panne et non en regle metier', () => {
    const err = new UnknownGameStatusError('archive');
    expect(err).not.toBeInstanceOf(DomainError);
    expect(err.name).toBe('UnknownGameStatusError');
    expect(err.message).toContain('archive');
  });
});

/**
 * CHAQUE ERREUR PORTE SON NOM DE CLASSE, SANS EXCEPTION (issue #33).
 *
 * L issue #33 inscrit que le commit `e7581d4` a ecrase son cycle TDD : test et
 * implementation dans le meme commit, donc aucun rouge n a jamais ete vu. Le
 * cycle est irrattrapable, mais ce qu il devait garantir se verifie encore.
 *
 * Fait le 05/11, par mutation sur les quatre classes de ce commit :
 * - retirer l heritage de `DomainError`        -> 2 rouges
 * - retirer le contexte chiffre d un message   -> 1 rouge, pour chacune des
 *   trois classes essayees
 * - faire perdre a `TeamBlockedError` son nom de classe -> **AUCUN rouge**
 *
 * La derniere est le trou : le nom n etait verifie que pour huit classes sur
 * dix-sept. Ce test ferme le trou sans liste a maintenir — il ENUMERE les
 * classes exportees, donc une classe ajoutee demain est couverte d office.
 *
 * Ce n est pas cosmetique : `global-exception.filter.ts` distingue les erreurs
 * par leur nom. Une classe qui perd le sien devient indistinguable d une autre
 * dans les journaux et dans Sentry. Et les trois erreurs d infrastructure
 * ci-dessus posent `this.name` A LA MAIN, puisqu elles n heritent pas de
 * `DomainError` qui le ferait pour elles : ce sont les plus exposees.
 */
describe('toutes les erreurs du module', () => {
  it('portent leur propre nom de classe', async () => {
    const module = (await import('./errors.js')) as Record<string, unknown>;

    const classes = Object.entries(module).filter(
      ([, valeur]) => typeof valeur === 'function' && valeur.prototype instanceof Error,
    );

    expect(classes.length, 'aucune classe trouvee : ce test ne garderait rien').toBeGreaterThan(10);

    const fautives = classes
      .map(([nom, Classe]) => {
        // Sans argument : le message contiendra « undefined », ce qui est sans
        // importance ici. Seul le nom est en cause.
        const instance = new (Classe as new () => Error)();
        return instance.name === nom ? null : `${nom} se nomme « ${instance.name} »`;
      })
      .filter((x): x is string => x !== null);

    expect(fautives, 'ces classes ne portent pas leur nom').toEqual([]);
  });
});
