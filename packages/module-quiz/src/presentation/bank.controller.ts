import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import {
  addQuestionSchema,
  createBankSchema,
  patchQuestionSchema,
  renameBankSchema,
} from './dto/quiz.dto.js';

@Controller('api/modules/quiz/banks')
export class BankController {
  // Jeton explicite : sans lui, la métadonnée de type que Nest utiliserait pour
  // deviner ce use-case n'existe pas sous le transform esbuild de Vitest, et la
  // dépendance resterait à undefined. Même raison que chez le loto.
  constructor(@Inject(ManageBankUseCase) private readonly banks: ManageBankUseCase) {}

  @Get()
  async list() {
    return { banks: await this.banks.list() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.banks.findOne({ bankId: id });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createBankSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    if (parsed.data.duplicateOf !== undefined) {
      return this.banks.duplicate({
        bankId: parsed.data.duplicateOf,
        name: parsed.data.name,
        createdBy: userId,
      });
    }
    return this.banks.createBlank({ name: parsed.data.name, createdBy: userId });
  }

  @Patch(':id')
  async rename(@Param('id') id: string, @Body() body: unknown) {
    const parsed = renameBankSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.banks.rename({ bankId: id, name: parsed.data.name });
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.banks.delete({ bankId: id });
    return { ok: true };
  }

  @Post(':id/questions')
  async addQuestion(@Param('id') id: string, @Body() body: unknown) {
    const parsed = addQuestionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.banks.addQuestion({
      bankId: id,
      prompt: parsed.data.prompt,
      answerMode: parsed.data.answerMode,
    });
  }

  @Patch(':id/questions/:questionId')
  async patchQuestion(
    @Param('id') _id: string,
    @Param('questionId') questionId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchQuestionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const { prompt, imageId, timeLimit, accentsSensibles, casseSensible, options, acceptedAnswers } =
      parsed.data;
    // Champ par champ : exactOptionalPropertyTypes refuse un
    // `imageId: string | null | undefined` assigné à `imageId?: string | null`.
    const patch: {
      prompt?: string;
      imageId?: string | null;
      timeLimit?: number | null;
      regles?: { accentsSensibles: boolean; casseSensible: boolean };
      options?: readonly {
        rank: number;
        label: string | null;
        imageId: string | null;
        imageAlt: string | null;
        isCorrect: boolean;
      }[];
      acceptedAnswers?: readonly string[];
    } = {};
    if (prompt !== undefined) patch.prompt = prompt;
    if (imageId !== undefined) patch.imageId = imageId;
    if (timeLimit !== undefined) patch.timeLimit = timeLimit;
    // `optionSchema` ne porte pas encore de texte alternatif par proposition :
    // seule l'image de la QUESTION entière (tache 14) en exige un. Un alt par
    // proposition resterait a ouvrir pour la question « mot <-> image ».
    if (options !== undefined) patch.options = options.map((option) => ({ ...option, imageAlt: null }));
    if (acceptedAnswers !== undefined) patch.acceptedAnswers = acceptedAnswers;
    // `null` = hériter du défaut de session ; présent, même partiellement, les
    // deux drapeaux sont écrits ensemble (valeurs par défaut pour l'absent).
    if (accentsSensibles !== undefined || casseSensible !== undefined) {
      patch.regles = { accentsSensibles: accentsSensibles ?? true, casseSensible: casseSensible ?? false };
    }

    await this.banks.updateQuestion({ questionId, patch });
    return { ok: true };
  }

  @Delete(':id/questions/:questionId')
  async removeQuestion(@Param('id') _id: string, @Param('questionId') questionId: string) {
    await this.banks.deleteQuestion({ questionId });
    return { ok: true };
  }
}
