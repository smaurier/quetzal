import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { ManageDecksUseCase } from '../application/manage-decks.use-case.js';
import type { CardImageStore } from '../domain/ports/card-image.store.js';
import { uploadImageSchema } from './dto/loto.dto.js';

@Controller('api/modules/loto')
export class ImageController {
  // Jetons explicites, cf. loto.gateway.ts : sans eux, la métadata de type que
  // Nest utiliserait pour deviner ces dépendances n existe pas sous le
  // transform esbuild de Vitest, et elles resteraient à undefined.
  constructor(
    @Inject('LotoCardImageStore') private readonly images: CardImageStore,
    @Inject(ManageDecksUseCase) private readonly decks: ManageDecksUseCase,
  ) {}

  // Corps binaire plutôt que du JSON en base64 : l adresse dépend du contenu
  // (décision D6), donc autant laisser le navigateur mettre l image en cache
  // via un `<img src>` normal — un corps JSON forfeit cette sémantique et
  // gonfle la charge d un tiers pour rien.
  @Get('images/:hash')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async read(@Param('hash') hash: string): Promise<StreamableFile> {
    const image = await this.images.findByHash(hash);
    if (image === null) throw new NotFoundException();
    return new StreamableFile(image.bytes, { type: image.mimeType });
  }

  @Post('decks/:deckId/cards/:rank/image')
  async upload(
    @Param('deckId') deckId: string,
    @Param('rank') rank: string,
    @Body() body: unknown,
  ): Promise<{ imageId: string }> {
    const parsedRank = Number(rank);
    if (!Number.isInteger(parsedRank) || parsedRank < 1) {
      throw new BadRequestException('Rang de carte invalide');
    }

    const parsed = uploadImageSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // L image est référencée par son empreinte, pas par l identifiant de
    // ligne : l adresse reste la même après déduplication (décision D6).
    const stored = await this.images.put({
      mimeType: parsed.data.mimeType,
      bytes: new Uint8Array(Buffer.from(parsed.data.data, 'base64')),
    });
    await this.decks.editCard({
      deckId,
      rank: parsedRank,
      patch: { imageId: stored.contentHash },
    });
    return { imageId: stored.contentHash };
  }
}
