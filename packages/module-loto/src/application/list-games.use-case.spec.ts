import { describe, it, expect } from 'vitest';
import { ListGamesUseCase } from './list-games.use-case.js';
import { FakeDeckRepository, FakeGameRepository, deckOf } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

describe('ListGamesUseCase', () => {
  it('joint le nom du jeu de cartes à chaque partie', async () => {
    const decks = new FakeDeckRepository();
    const games = new FakeGameRepository();
    decks.add(deckOf(54, { id: 'deck-1', name: 'Lotería tradicional' }));
    await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const list = await new ListGamesUseCase(games, decks).execute();

    expect(list[0]?.deckName).toBe('Lotería tradicional');
  });

  it('affiche une partie dont le jeu a été supprimé, sans nom plutôt que sans partie', async () => {
    const decks = new FakeDeckRepository();
    const games = new FakeGameRepository();
    await games.create({ deckId: 'disparu', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const list = await new ListGamesUseCase(games, decks).execute();

    expect(list).toHaveLength(1);
    expect(list[0]?.deckName).toBeNull();
  });

  it('ne lit chaque jeu de cartes qu une fois, même pour dix parties', async () => {
    const decks = new FakeDeckRepository();
    const games = new FakeGameRepository();
    decks.add(deckOf(54, { id: 'deck-1' }));
    for (let i = 0; i < 10; i++) {
      await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: `C${String(i)}`, settings: { ...SETTINGS } });
    }
    let reads = 0;
    const original = decks.findById.bind(decks);
    decks.findById = async (id: string) => {
      reads += 1;
      return original(id);
    };

    await new ListGamesUseCase(games, decks).execute();
    expect(reads).toBe(1);
  });
});
