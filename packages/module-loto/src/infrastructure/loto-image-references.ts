import { Injectable } from '@nestjs/common';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { ImageReferenceProvider } from '@quetzal/core/images';

interface CarteRow { imageId: string | null }

/**
 * `as unknown as` : le motif deja etabli dans ce dossier
 * (`prisma-deck.repository.ts`), parce que le client cloisonne n est pas type
 * sur la surface generee par Prisma.
 */
interface LotoPrisma {
  loto_Card: { findMany(args: unknown): Promise<CarteRow[]> };
}

/** Exactement la lecture que `deleteOrphans` faisait avant, rendue au module. */
@Injectable()
export class LotoImageReferences implements ImageReferenceProvider {
  async referencedImageIds(): Promise<readonly string[]> {
    const prisma = getTenantScopedPrisma() as unknown as LotoPrisma;
    const cartes = await prisma.loto_Card.findMany({
      where: { imageId: { not: null } },
      select: { imageId: true },
    });
    return [
      ...new Set(cartes.map((carte) => carte.imageId).filter((id): id is string => id !== null)),
    ];
  }
}
