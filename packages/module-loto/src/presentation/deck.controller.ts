import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, BadRequestException } from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { ManageDecksUseCase } from '../application/manage-decks.use-case.js';
import { createDeckSchema, patchDeckSchema } from './dto/loto.dto.js';

@Controller('api/modules/loto/decks')
export class DeckController {
  // Jeton explicite, cf. loto.gateway.ts : sans lui, la métadata de type que
  // Nest utiliserait pour deviner ManageDecksUseCase n existe pas sous le
  // transform esbuild de Vitest, et cette dépendance resterait à undefined.
  constructor(@Inject(ManageDecksUseCase) private readonly decks: ManageDecksUseCase) {}

  @Get()
  async list() {
    return { decks: await this.decks.list() };
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createDeckSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    if (parsed.data.duplicateOf !== undefined) {
      return this.decks.duplicate({
        deckId: parsed.data.duplicateOf,
        name: parsed.data.name,
        createdBy: userId,
      });
    }
    return this.decks.createBlank({ name: parsed.data.name, createdBy: userId });
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: unknown) {
    const parsed = patchDeckSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    if (parsed.data.name !== undefined) {
      await this.decks.rename({ deckId: id, name: parsed.data.name });
    }
    if (parsed.data.card !== undefined) {
      const { rank, label, imageId } = parsed.data.card;
      // Construit le patch champ par champ : le schéma Zod infère
      // `label?: string | undefined`, incompatible avec exactOptionalPropertyTypes
      // pour `{ label?: string }` si on l assigne telle quelle.
      const patch: { label?: string; imageId?: string | null } = {};
      if (label !== undefined) patch.label = label;
      if (imageId !== undefined) patch.imageId = imageId;
      await this.decks.editCard({ deckId: id, rank, patch });
    }
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.decks.delete({ deckId: id });
    return { ok: true };
  }
}
