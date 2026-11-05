import { describe, it, expect } from 'vitest';
import { FakeGameRepository } from './fake-repositories.js';
import type { GameSettings } from '../../domain/ports/game.repository.js';

const SETTINGS: GameSettings = { patterns: ['linea'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null };

async function aGame(games: FakeGameRepository, joinCode = 'AAA111') {
  return games.create({ deckId: 'deck-1', createdBy: 'owner-1', joinCode, settings: { ...SETTINGS } });
}

describe('FakeGameRepository, advancePattern', () => {
  it('rend false quand la partie n existe pas', async () => {
    const games = new FakeGameRepository();

    expect(await games.advancePattern('absente', 0)).toBe(false);
  });

  it('rend false et ne modifie rien quand l index differe de depuisIndex', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);

    expect(await games.advancePattern(game.id, 1)).toBe(false);

    const reloaded = await games.findById(game.id);
    expect(reloaded?.patternIndex).toBe(0);
  });

  it('rend true et avance de exactement un quand l index correspond', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);

    expect(await games.advancePattern(game.id, 0)).toBe(true);

    const reloaded = await games.findById(game.id);
    expect(reloaded?.patternIndex).toBe(1);
  });

  // C est la course que la méthode existe pour empêcher : deux téléphones au
  // même tirage appelleraient tous deux advancePattern(id, 0). Le premier
  // doit gagner, le second doit se heurter à un index déjà avancé, pas à un
  // deuxième avancement qui ferait sauter une figure.
  it('deux appels successifs au meme depuisIndex n avancent que d un cran', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);

    expect(await games.advancePattern(game.id, 0)).toBe(true);
    expect(await games.advancePattern(game.id, 0)).toBe(false);

    const reloaded = await games.findById(game.id);
    expect(reloaded?.patternIndex).toBe(1);
  });

  // Simule une course perdue, comme failNextAppendDraw le fait pour les
  // tirages : le prochain advancePattern echoue sans rien modifier, puis
  // l appel suivant redevient normal.
  it('failNextAdvancePattern force un echec sans rien modifier, puis redevient normal', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);
    games.failNextAdvancePattern = true;

    expect(await games.advancePattern(game.id, 0)).toBe(false);
    const pendant = await games.findById(game.id);
    expect(pendant?.patternIndex).toBe(0);

    expect(await games.advancePattern(game.id, 0)).toBe(true);
    const apres = await games.findById(game.id);
    expect(apres?.patternIndex).toBe(1);
  });
});

describe('FakeGameRepository, hasValidClaimAt', () => {
  it('rend true quand une reclamation valide existe a ce tirage', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);
    await games.recordClaim({ gameId: game.id, teamId: 'team-1', atDraw: 3, valid: true, pattern: 'linea' });

    expect(await games.hasValidClaimAt(game.id, 3)).toBe(true);
  });

  it('rend false quand la reclamation a ce tirage est invalide', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);
    await games.recordClaim({ gameId: game.id, teamId: 'team-1', atDraw: 3, valid: false, pattern: 'linea' });

    expect(await games.hasValidClaimAt(game.id, 3)).toBe(false);
  });

  it('rend false quand le tirage ne correspond pas', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);
    await games.recordClaim({ gameId: game.id, teamId: 'team-1', atDraw: 3, valid: true, pattern: 'linea' });

    expect(await games.hasValidClaimAt(game.id, 4)).toBe(false);
  });

  it('rend false quand la reclamation valide appartient a une autre partie', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games, 'AAA111');
    const other = await aGame(games, 'BBB222');
    await games.recordClaim({ gameId: other.id, teamId: 'team-1', atDraw: 3, valid: true, pattern: 'linea' });

    expect(await games.hasValidClaimAt(game.id, 3)).toBe(false);
  });
});

describe('FakeGameRepository, setWinner', () => {
  it('ecrit wonByTeamId quand la partie existe', async () => {
    const games = new FakeGameRepository();
    const game = await aGame(games);

    await games.setWinner(game.id, 'team-1');

    const reloaded = await games.findById(game.id);
    expect(reloaded?.wonByTeamId).toBe('team-1');
  });

  it('ne fait rien et ne leve pas quand la partie n existe pas', async () => {
    const games = new FakeGameRepository();

    await expect(games.setWinner('absente', 'team-1')).resolves.toBeUndefined();
  });
});
