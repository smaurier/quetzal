import { Injectable } from '@nestjs/common';
import { DeckLockedError, DeckNotFoundError } from '../domain/errors.js';
import type { CardImageStore } from '../domain/ports/card-image.store.js';
import type {
  Deck,
  DeckCard,
  DeckRepository,
  DeckSummary,
} from '../domain/ports/deck.repository.js';

@Injectable()
export class ManageDecksUseCase {
  constructor(
    private readonly decks: DeckRepository,
    private readonly images: CardImageStore,
  ) {}

  async list(): Promise<DeckSummary[]> {
    return this.decks.list();
  }

  async findOne(input: { deckId: string }): Promise<Deck> {
    return this.require(input.deckId);
  }

  async duplicate(input: { deckId: string; name: string; createdBy: string }): Promise<Deck> {
    const source = await this.require(input.deckId);
    // Pas de verrou ici : dupliquer ne touche jamais à l original, c est même
    // le geste qui permet à Elda de repartir d un jeu pendant qu il sert.
    return this.decks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      cards: source.cards.map((card) => ({
        rank: card.rank,
        label: card.label,
        imageId: card.imageId,
      })),
    });
  }

  async createBlank(input: { name: string; createdBy: string }): Promise<Deck> {
    return this.decks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      cards: [],
    });
  }

  async rename(input: { deckId: string; name: string }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.rename(input.deckId, input.name);
  }

  async editCard(input: {
    deckId: string;
    rank: number;
    patch: { label?: string; imageId?: string | null };
  }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.updateCard(input.deckId, input.rank, input.patch);
  }

  async addCard(input: { deckId: string; label?: string; imageId?: string | null }): Promise<DeckCard> {
    const deck = await this.requireUnlocked(input.deckId);
    // Le plus haut rang et non le nombre de cartes : les rangs peuvent avoir
    // des trous, et @@unique([deckId, rank, tenantId]) refuserait un doublon.
    const rang = deck.cards.reduce((haut, carte) => Math.max(haut, carte.rank), 0) + 1;
    return this.decks.addCard(input.deckId, {
      rank: rang,
      label: input.label ?? '',
      imageId: input.imageId ?? null,
    });
  }

  async delete(input: { deckId: string }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.delete(input.deckId);
    // APRES, et jamais avant : tant que le jeu est la, ses cartes referencent
    // encore leurs images et le ramassage ne trouverait rien. Issue #27.
    await this.images.deleteOrphans();
  }

  private async require(deckId: string): Promise<Deck> {
    const deck = await this.decks.findById(deckId);
    if (deck === null) throw new DeckNotFoundError(deckId);
    return deck;
  }

  private async requireUnlocked(deckId: string): Promise<Deck> {
    const deck = await this.require(deckId);
    if (await this.decks.hasUnfinishedGame(deckId)) throw new DeckLockedError(deckId);
    return deck;
  }
}
