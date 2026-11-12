import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import type { CardImageStore } from '@quetzal/core/images';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import { uploadQuizImageSchema } from './dto/quiz.dto.js';

export const QUIZ_IMAGE_STORE = 'QuizImageStore';

@Controller('api/modules/quiz')
export class QuizImageController {
  // Jetons explicites : sans eux, la métadonnée de type que Nest utiliserait
  // pour deviner ces dépendances n'existe pas sous le transform esbuild de
  // Vitest, et elles resteraient à undefined. Même raison que chez le loto.
  constructor(
    @Inject(QUIZ_IMAGE_STORE) private readonly images: CardImageStore,
    @Inject(ManageBankUseCase) private readonly banks: ManageBankUseCase) {}

  // Corps binaire plutôt que du JSON : l'adresse dépend du contenu, donc le
  // navigateur peut mettre l'image en cache via un `<img src>` normal.
  @Get('images/:hash')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async read(@Param('hash') hash: string): Promise<StreamableFile> {
    const image = await this.images.findByHash(hash);
    if (image === null) throw new NotFoundException();
    return new StreamableFile(image.bytes, { type: image.mimeType });
  }

  @Post('questions/:questionId/image')
  async uploadQuestion(
    @Param('questionId') questionId: string,
    @Body() body: unknown): Promise<{ imageId: string }> {
    const parsed = uploadQuizImageSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // Référencée par son empreinte et non par un identifiant de ligne :
    // l'adresse reste la même après déduplication, et deux questions qui
    // portent la même image ne la stockent qu'une fois.
    const stored = await this.images.put({
      mimeType: parsed.data.mimeType,
      bytes: new Uint8Array(Buffer.from(parsed.data.data, 'base64')),
    });
    await this.banks.updateQuestion({
      questionId,
      patch: { imageId: stored.contentHash, imageAlt: parsed.data.alt },
    });
    return { imageId: stored.contentHash };
  }
}
