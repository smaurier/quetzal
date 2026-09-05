import { Injectable } from '@nestjs/common';
import { DeckLockedError, DeckNotFoundError } from '../domain/errors.js';
import type { Deck, DeckRepository, DeckSummary } from '../domain/ports/deck.repository.js';

@Injectable()
export class ManageDecksUseCase {
  constructor(private readonly decks: DeckRepository) {}

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

  async delete(input: { deckId: string }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.delete(input.deckId);
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
