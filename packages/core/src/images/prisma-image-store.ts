import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '../tenant/scoped-prisma.js';
import type { CardImageStore, StoredImage } from './image-store.js';

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
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  loto_Card: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<{ imageId: string | null }[]>;
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

  /**
   * Les images que plus aucune carte ne reference.
   *
   * ⛔ Deux requetes et un `notIn`, et non un `deleteMany` sur le jeu
   * supprime : la deduplication par empreinte fait qu une image sert
   * plusieurs cartes dans plusieurs jeux, donc « les images du jeu » n existe
   * pas comme ensemble. On part des references encore vivantes.
   *
   * Pas de `$queryRaw` ici — §9 l interdit dans un module, et le helper
   * cloisonne refuse une requete sans clause `tenantId`, ce qu une
   * anti-jointure n a pas naturellement. L extension de cloisonnement fait ce
   * travail sur les deux appels ci-dessous, ce qui garde le locataire sans
   * l ecrire a la main.
   *
   * Le volume vise est une classe : quelques dizaines d images par locataire.
   * Remonter les ids en memoire est proportionne, et c est la meme hypothese
   * que celle qui fait vivre les octets en base (decision D6, issue #28).
   */
  async deleteOrphans(): Promise<number> {
    const cartes = await this.prisma.loto_Card.findMany({
      where: { imageId: { not: null } },
      select: { imageId: true },
    });
    const referencees = [...new Set(cartes.map((carte) => carte.imageId).filter(
      (id): id is string => id !== null,
    ))];

    const { count } = await this.prisma.loto_CardImage.deleteMany({
      where: { id: { notIn: referencees } },
    });
    return count;
  }
}
