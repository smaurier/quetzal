import { Injectable } from '@nestjs/common';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { ImageReferenceProvider } from '@quetzal/core/images';

/**
 * ⛔ LES DEUX PORTEURS, et pas seulement la question : une proposition porte
 * aussi une image (c'est ce qui fait de « mot ↔ image » une configuration et
 * non un type de question). En oublier un ferait ramasser des images vivantes.
 */
@Injectable()
export class QuizImageReferences implements ImageReferenceProvider {
  async referencedImageIds(): Promise<readonly string[]> {
    const prisma = getTenantScopedPrisma() as unknown as {
      quiz_Question: { findMany(args: unknown): Promise<{ imageId: string | null }[]> };
      quiz_Option: { findMany(args: unknown): Promise<{ imageId: string | null }[]> };
    };

    const [questions, options] = await Promise.all([
      prisma.quiz_Question.findMany({
        where: { imageId: { not: null } },
        select: { imageId: true },
      }),
      prisma.quiz_Option.findMany({
        where: { imageId: { not: null } },
        select: { imageId: true },
      }),
    ]);

    return [
      ...new Set(
        [...questions, ...options]
          .map((ligne) => ligne.imageId)
          .filter((id): id is string => id !== null)),
    ];
  }
}
