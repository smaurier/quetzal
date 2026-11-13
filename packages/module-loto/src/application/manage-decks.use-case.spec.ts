import { describe, it, expect } from 'vitest';
import { DeckLockedError, DeckNotFoundError } from '../domain/errors.js';
import { ManageDecksUseCase } from './manage-decks.use-case.js';
import { FakeCardImageStore, FakeDeckRepository, deckOf } from './testing/fake-repositories.js';

function build() {
  const decks = new FakeDeckRepository();
  const images = new FakeCardImageStore();
  const useCase = new ManageDecksUseCase(decks, images);
  return { decks, images, useCase };
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

  // Issue #26 : `PATCH /decks/:id` passait par un `updateMany`, qui ne touche
  // aucune ligne quand le rang n existe pas encore. Partir d un jeu vierge
  // etait donc impossible : le bouton « Ajouter une carte » ne faisait rien,
  // en silence, et il fallait dupliquer un jeu existant.
  //
  // Le rang est attribue ICI et non dans le depot : le cas d usage tient deja
  // le jeu, donc le calcul reste pur et testable sans base, et le port reste
  // bete. @@unique([deckId, rank, tenantId]) interdit toute collision.
  it('ajoute une premiere carte a un jeu vierge', async () => {
    const { decks, useCase } = build();
    const vierge = decks.add(deckOf(0));

    const carte = await useCase.addCard({ deckId: vierge.id, label: 'El Gallo' });

    expect(carte.rank).toBe(1);
    expect(carte.label).toBe('El Gallo');
    expect((await useCase.findOne({ deckId: vierge.id })).cards).toHaveLength(1);
  });

  it('donne a la carte suivante le rang apres le dernier', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(3));

    expect((await useCase.addCard({ deckId: 'deck-1', label: 'La Dama' })).rank).toBe(4);
  });

  // Les rangs peuvent avoir des trous (une carte retiree) : on repart du plus
  // haut, jamais du nombre de cartes, sinon on reecrirait un rang existant.
  it('repart du rang le plus haut, pas du nombre de cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(0, { cards: [{ id: 'c', rank: 9, label: 'El Sol', imageId: null }] }));

    expect((await useCase.addCard({ deckId: 'deck-1', label: 'La Luna' })).rank).toBe(10);
  });

  // RENVERSÉ le 13/11 (#102). Le bouton de l editeur creait une carte VIERGE,
  // nommee ensuite au blur : rien n empechait donc une carte sans nom d arriver
  // en partie. Sylvain a tranche qu une carte est toujours nommee ; l ecran
  // demande le nom AVANT de creer, et le nom donne est celui qui est garde.
  it('cree la carte avec le nom donne, et non un nom vide a remplir', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(0));

    const carte = await useCase.addCard({ deckId: 'deck-1', label: 'El Nopal' });

    expect(carte.label).toBe('El Nopal');
    expect(carte.rank).toBe(1);
  });

  it('refuse d ajouter une carte a un jeu inconnu', async () => {
    const { useCase } = build();

    await expect(useCase.addCard({ deckId: 'absent', label: 'X' })).rejects.toBeInstanceOf(
      DeckNotFoundError,
    );
  });

  // Meme verrou D5 que les autres ecritures : on ne touche pas a un jeu qui
  // sert une partie en cours.
  it('refuse d ajouter une carte a un jeu verrouille', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(0));
    decks.unfinished.add('deck-1');

    await expect(useCase.addCard({ deckId: 'deck-1', label: 'X' })).rejects.toBeInstanceOf(
      DeckLockedError,
    );
  });
});

/**
 * Issue #27 : supprimer un jeu laissait ses images en base, sans aucun chemin
 * de suppression.
 *
 * ⚠️ Et il n y a PAS « les images du jeu » : `Loto_CardImage` est dedupliquee
 * par empreinte (`@@unique([contentHash, tenantId])`), donc une meme image sert
 * plusieurs cartes, dans plusieurs jeux. Supprimer « celles du jeu » detruirait
 * l image d un voisin. D ou un ramassage de ce qui n est plus reference, et non
 * une suppression en cascade — ce que garde ce fichier, c est qu on le DEMANDE
 * au bon moment. Ce qu il garde ou detruit se prouve contre un vrai Postgres,
 * dans le spec d integration.
 */
describe('ManageDecksUseCase, les images orphelines', () => {
  it('ramasse les orphelines apres avoir supprime un jeu', async () => {
    const { decks, images, useCase } = build();
    decks.add(deckOf(54));

    await useCase.delete({ deckId: 'deck-1' });

    expect(images.ramassages).toBe(1);
  });

  /**
   * Le ramassage vient APRES la suppression, pas avant : lance avant, il
   * compterait les cartes du jeu encore present et ne ramasserait rien.
   */
  it('ne ramasse rien quand la suppression est refusee', async () => {
    const { decks, images, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    await expect(useCase.delete({ deckId: 'deck-1' })).rejects.toThrow(DeckLockedError);

    expect(images.ramassages, 'un jeu verrouille garde ses cartes, donc ses images').toBe(0);
  });

  it('ne ramasse rien quand le jeu n existe pas', async () => {
    const { images, useCase } = build();

    await expect(useCase.delete({ deckId: 'fantome' })).rejects.toThrow(DeckNotFoundError);

    expect(images.ramassages).toBe(0);
  });
});
