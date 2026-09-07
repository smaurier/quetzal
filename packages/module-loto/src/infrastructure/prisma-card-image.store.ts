import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { CardImageStore, StoredImage } from '../domain/ports/card-image.store.js';

interface ImageRow {
  id: string;
  contentHash: string;
  mimeType: string;
  bytes: Uint8Array;
}

interface LotoPrisma {
  loto_CardImage: {
    findFirst(args: { where: Record<string, unknown> }): Promise<ImageRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<ImageRow>;
  };
}

/**
 * `Loto_CardImage` a une clé composite `@@id([id, tenantId])` : voir
 * `prisma-deck.repository.ts` pour la raison de s en tenir à `findFirst`/
 * `create` plutôt qu à `findUnique`.
 */
@Injectable()
export class PrismaCardImageStore implements CardImageStore {
  private get prisma(): LotoPrisma {
    return getTenantScopedPrisma() as unknown as LotoPrisma;
  }

  async put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage> {
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');
    const existing = await this.prisma.loto_CardImage.findFirst({ where: { contentHash } });
    if (existing !== null) return existing;

    return this.prisma.loto_CardImage.create({
      data: { id: newId(), contentHash, mimeType: input.mimeType, bytes: input.bytes },
    });
  }

  async findByHash(contentHash: string): Promise<StoredImage | null> {
    return this.prisma.loto_CardImage.findFirst({ where: { contentHash } });
  }
}
