import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '../tenant/scoped-prisma.js';
import type { CardImageStore, ImageReferenceProvider, StoredImage } from './image-store.js';

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
}

/**
 * Jeton du tableau de fournisseurs. Nest n a pas de `multi: true` : chaque
 * module fournit SA classe, et l hote assemble le tableau par fabrique,
 * cf. `apps/api/src/app.module.ts`.
 */
export const IMAGE_REFERENCE_PROVIDERS = 'ImageReferenceProviders';

/**
 * `Loto_CardImage` a une clé composite `@@id([id, tenantId])` : voir
 * `prisma-deck.repository.ts` pour la raison de s en tenir à `findFirst`/
 * `create` plutôt qu à `findUnique`.
 */
@Injectable()
export class PrismaCardImageStore implements CardImageStore {
  constructor(
    @Optional()
    @Inject(IMAGE_REFERENCE_PROVIDERS)
    private readonly fournisseurs: readonly ImageReferenceProvider[] = []) {}

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
   * ⛔ Un ramassage, et non une suppression en cascade : la deduplication par
   * empreinte fait qu une meme image sert plusieurs lignes, dans plusieurs
   * modules. Supprimer « les images du jeu » detruirait celle d un voisin.
   *
   * ⛔ Et un registre VIDE n est pas « rien ne reference » : c est un cablage
   * manquant. `notIn: []` supprimerait toute la table et rendrait un nombre
   * flatteur. On refuse donc de ramasser plutot que de tout detruire.
   *
   * Pas de `$queryRaw` ici : §9 l interdit dans un module, et le helper
   * cloisonne refuse une requete sans clause `tenantId`, ce qu une
   * anti-jointure n a pas naturellement. L extension de cloisonnement fait ce
   * travail sur l appel ci-dessous, ce qui garde le locataire sans l ecrire a
   * la main.
   *
   * Le volume vise est une classe : quelques dizaines d images par locataire.
   * Remonter les ids en memoire est proportionne, et c est la meme hypothese
   * que celle qui fait vivre les octets en base (decision D6, issue #28).
   */
  async deleteOrphans(): Promise<number> {
    if (this.fournisseurs.length === 0) return 0;

    const listes = await Promise.all(
      this.fournisseurs.map((fournisseur) => fournisseur.referencedImageIds()));
    const referencees = [...new Set(listes.flat())];

    const { count } = await this.prisma.loto_CardImage.deleteMany({
      where: { id: { notIn: referencees } },
    });
    return count;
  }
}
