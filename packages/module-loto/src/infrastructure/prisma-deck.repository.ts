import { Injectable } from '@nestjs/common';
import { getTenantScopedPrisma } from '@quetzal/core';
import { newId } from '@quetzal/db';
import type {
  Deck, DeckRepository, DeckSummary, NewDeckCard,
} from '../domain/ports/deck.repository.js';

interface DeckRow { id: string; name: string; isTemplate: boolean }
interface CardRow { id: string; rank: number; label: string; imageId: string | null }

interface LotoPrisma {
  loto_Deck: {
    findMany(args?: unknown): Promise<DeckRow[]>;
    findFirst(args: unknown): Promise<DeckRow | null>;
    create(args: unknown): Promise<DeckRow>;
    updateMany(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  loto_Card: {
    findMany(args: unknown): Promise<CardRow[]>;
    createMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
    count(args: unknown): Promise<number>;
  };
  loto_Game: { count(args: unknown): Promise<number> };
}

/**
 * `Loto_Deck` et `Loto_Card` ont une clé composite `@@id([id, tenantId])` :
 * Prisma n'accepte `findUnique`/`update`/`delete` (WhereUniqueInput) que via le
 * sélecteur généré `id_tenantId`, que l'extension de cloisonnement ne connaît
 * pas — elle fusionne `tenantId` à plat dans `where`. Les variantes `*Many`
 * acceptent un `where` arbitraire et laissent l'extension faire son travail.
 */
@Injectable()
export class PrismaDeckRepository implements DeckRepository {
  private get prisma(): LotoPrisma {
    return getTenantScopedPrisma() as unknown as LotoPrisma;
  }

  async list(): Promise<DeckSummary[]> {
    const decks = await this.prisma.loto_Deck.findMany({ orderBy: { name: 'asc' } });
    const summaries: DeckSummary[] = [];
    for (const deck of decks) {
      const cardCount = await this.prisma.loto_Card.count({ where: { deckId: deck.id } });
      summaries.push({ id: deck.id, name: deck.name, isTemplate: deck.isTemplate, cardCount });
    }
    return summaries;
  }

  async findById(deckId: string): Promise<Deck | null> {
    const deck = await this.prisma.loto_Deck.findFirst({ where: { id: deckId } });
    if (!deck) return null;
    const cards = await this.prisma.loto_Card.findMany({
      where: { deckId },
      orderBy: { rank: 'asc' },
    });
    return { id: deck.id, name: deck.name, isTemplate: deck.isTemplate, cardCount: cards.length, cards };
  }

  async create(input: { name: string; isTemplate: boolean; createdBy: string; cards: NewDeckCard[] }): Promise<Deck> {
    const deckId = newId();
    await this.prisma.loto_Deck.create({
      data: { id: deckId, name: input.name, isTemplate: input.isTemplate, createdBy: input.createdBy },
    });
    if (input.cards.length > 0) {
      await this.prisma.loto_Card.createMany({
        data: input.cards.map((card) => ({
          id: newId(), deckId, rank: card.rank, label: card.label, imageId: card.imageId,
        })),
      });
    }
    const created = await this.findById(deckId);
    if (!created) throw new Error('Jeu créé puis introuvable');
    return created;
  }

  async rename(deckId: string, name: string): Promise<void> {
    await this.prisma.loto_Deck.updateMany({ where: { id: deckId }, data: { name } });
  }

  async updateCard(deckId: string, rank: number, patch: { label?: string; imageId?: string | null }): Promise<void> {
    await this.prisma.loto_Card.updateMany({ where: { deckId, rank }, data: patch });
  }

  async delete(deckId: string): Promise<void> {
    await this.prisma.loto_Deck.deleteMany({ where: { id: deckId } });
  }

  async hasUnfinishedGame(deckId: string): Promise<boolean> {
    const count = await this.prisma.loto_Game.count({
      where: { deckId, status: { in: ['draft', 'open', 'running'] } },
    });
    return count > 0;
  }
}
