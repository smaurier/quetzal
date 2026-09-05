import { describe, it, expect } from 'vitest';
import { DeckLockedError, DeckNotFoundError } from '../domain/errors.js';
import { ManageDecksUseCase } from './manage-decks.use-case.js';
import { FakeDeckRepository, deckOf } from './testing/fake-repositories.js';

function build() {
  const decks = new FakeDeckRepository();
  const useCase = new ManageDecksUseCase(decks);
  return { decks, useCase };
}

describe('ManageDecksUseCase', () => {
  it('liste les jeux avec leur nombre de cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));

    const list = await useCase.list();

    expect(list).toHaveLength(1);
    expect(list[0]?.cardCount).toBe(54);
  });

  it('duplique un jeu avec toutes ses cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54, { name: 'Lotería tradicional', isTemplate: true }));

    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Mi lotería', createdBy: 'u-1' });

    expect(copy.id).not.toBe('deck-1');
    expect(copy.name).toBe('Mi lotería');
    expect(copy.cards).toHaveLength(54);
    expect(copy.cards[0]?.label).toBe('Carta 1');
  });

  it('une copie n est jamais un modèle, même copiée d un modèle', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54, { isTemplate: true }));

    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Mi lotería', createdBy: 'u-1' });

    expect(copy.isTemplate).toBe(false);
  });

  it('éditer la copie ne touche pas au modèle', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54, { isTemplate: true }));
    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Mi lotería', createdBy: 'u-1' });

    await useCase.editCard({ deckId: copy.id, rank: 1, patch: { label: 'El gallito' } });

    const original = await decks.findById('deck-1');
    expect(original?.cards[0]?.label).toBe('Carta 1');
  });

  it('crée un jeu vierge', async () => {
    const { useCase } = build();

    const deck = await useCase.createBlank({ name: 'Vocabulario', createdBy: 'u-1' });

    expect(deck.name).toBe('Vocabulario');
    expect(deck.cards).toHaveLength(0);
    expect(deck.isTemplate).toBe(false);
  });

  it('renomme un jeu', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(20));

    await useCase.rename({ deckId: 'deck-1', name: 'Autre nom' });

    expect((await decks.findById('deck-1'))?.name).toBe('Autre nom');
  });

  it('refuse d éditer un jeu qu une partie en cours utilise', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    await expect(
      useCase.editCard({ deckId: 'deck-1', rank: 1, patch: { label: 'Interdit' } }),
    ).rejects.toBeInstanceOf(DeckLockedError);
    await expect(useCase.rename({ deckId: 'deck-1', name: 'Interdit' })).rejects.toBeInstanceOf(DeckLockedError);
  });

  it('refuse de supprimer un jeu qu une partie en cours utilise', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    await expect(useCase.delete({ deckId: 'deck-1' })).rejects.toBeInstanceOf(DeckLockedError);
    expect(await decks.findById('deck-1')).not.toBeNull();
  });

  it('supprime un jeu qu aucune partie en cours n utilise', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));

    await useCase.delete({ deckId: 'deck-1' });

    expect(await decks.findById('deck-1')).toBeNull();
  });

  it('refuse de dupliquer un jeu inconnu', async () => {
    const { useCase } = build();
    await expect(
      useCase.duplicate({ deckId: 'absent', name: 'x', createdBy: 'u-1' }),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('duplique un jeu même verrouillé : la copie ne touche pas à l original', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Copie', createdBy: 'u-1' });
    expect(copy.cards).toHaveLength(54);
  });

  // Rétroactifs (audit correcteur-labs) : findOne existait sans test depuis le
  // commit "éditeur d un jeu de cartes". Couvre son seul appelant, la route de
  // lecture GET /decks/:id de deck.controller.ts.
  it('lit un jeu avec ses cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(3, { name: 'Lotería tradicional' }));

    const deck = await useCase.findOne({ deckId: 'deck-1' });

    expect(deck.name).toBe('Lotería tradicional');
    expect(deck.cards).toHaveLength(3);
  });

  it('refuse de lire un jeu inconnu', async () => {
    const { useCase } = build();

    await expect(useCase.findOne({ deckId: 'absent' })).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('lit un jeu même verrouillé : le verrou D5 ne s applique qu à l écriture', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    const deck = await useCase.findOne({ deckId: 'deck-1' });

    expect(deck.id).toBe('deck-1');
  });
});
