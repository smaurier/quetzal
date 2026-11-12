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
  loto_GameCard: { findMany(args: unknown): Promise<CarteRow[]> };
}

/**
 * Les images que le loto référence encore, sur ses **deux** porteurs.
 *
 * ⛔ `Loto_GameCard` compte autant que `Loto_Card`, et l'oublier perd des
 * données. Issue #85 : la carte gelée est la copie prise au lancement d'une
 * partie (D5, pour qu'une correction du jeu ne change pas le sens d'une partie
 * en cours), et elle porte sa propre colonne `imageId`.
 *
 * Le scénario qui perdait l'image : Elda corrige son jeu pendant qu'une partie
 * tourne, la carte vivante cesse de porter l'image, le ramassage ne voit plus
 * personne la référencer, et il la détruit. Les tablas des élèves la montraient
 * encore.
 *
 * ⚠️ Et le dédoublonnage traverse les deux tables, parce que le cas NORMAL
 * pendant une partie est que la même image soit portée par la carte vivante
 * **et** sa copie gelée.
 */
@Injectable()
export class LotoImageReferences implements ImageReferenceProvider {
  async referencedImageIds(): Promise<readonly string[]> {
    const prisma = getTenantScopedPrisma() as unknown as LotoPrisma;
    const critere = { where: { imageId: { not: null } }, select: { imageId: true } };

    const [vivantes, gelees] = await Promise.all([
      prisma.loto_Card.findMany(critere),
      prisma.loto_GameCard.findMany(critere),
    ]);

    return [
      ...new Set(
        [...vivantes, ...gelees]
          .map((carte) => carte.imageId)
          .filter((id): id is string => id !== null),
      ),
    ];
  }
}
