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
  UseFilters,
} from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { FinishSessionUseCase } from '../application/finish-session.use-case.js';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import { createSessionSchema, renameParticipantSchema } from './dto/quiz.dto.js';
import { SessionErrorsFilter } from './session-errors.filter.js';

/**
 * D9 : les commandes passent en HTTP, et la diffusion en WebSocket. Une
 * commande mérite un code de retour, un WebSocket ne sert qu'à diffuser.
 */
@Controller('api/modules/quiz/sessions')
@UseFilters(SessionErrorsFilter)
export class SessionController {
  // Jetons explicites : sans eux, la métadonnée de type que Nest utiliserait
  // n'existe pas sous le transform esbuild de Vitest, et les dépendances
  // resteraient à undefined. Même raison que chez le loto.
  constructor(
    @Inject(ManageSessionUseCase) private readonly sessions: ManageSessionUseCase,
    @Inject(RunQuestionUseCase) private readonly questions: RunQuestionUseCase,
    @Inject(FinishSessionUseCase) private readonly finish: FinishSessionUseCase,
    @Inject(SessionReportUseCase) private readonly report: SessionReportUseCase) {}

  @Get()
  async list() {
    return { sessions: await this.sessions.list() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.sessions.findOne({ sessionId: id });
  }

  /**
   * Lisible à tout statut, et c'est voulu : la route est réservée à
   * l'animatrice, et le retour ne compte que les questions jouées, donc il dit
   * vrai sur une séance interrompue comme sur une séance finie.
   */
  @Get(':id/report')
  async getReport(@Param('id') id: string) {
    return this.report.execute({ sessionId: id });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    return this.sessions.create({
      deckId: parsed.data.deckId,
      mode: parsed.data.mode,
      maxParticipants: parsed.data.maxParticipants,
      defaultTimeLimit: parsed.data.defaultTimeLimit,
      guestLocale: parsed.data.guestLocale ?? null,
      createdBy: userId,
    });
  }

  @Post(':id/open')
  async open(@Param('id') id: string) {
    await this.sessions.open({ sessionId: id });
    return { ok: true };
  }

  @Post(':id/start')
  async start(@Param('id') id: string) {
    await this.sessions.start({ sessionId: id });
    return { ok: true };
  }

  @Post(':id/questions/next')
  async next(@Param('id') id: string) {
    const ouverte = await this.questions.openNext({ sessionId: id });
    return { rank: ouverte.rank, deadlineAt: ouverte.deadlineAt };
  }

  @Post(':id/questions/close')
  async close(@Param('id') id: string) {
    return this.questions.close({ sessionId: id });
  }

  @Post(':id/finish')
  async finishSession(@Param('id') id: string) {
    await this.finish.execute({ sessionId: id });
    return { ok: true };
  }

  @Patch(':id/participants/:participantId')
  async renameParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown) {
    const parsed = renameParticipantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.sessions.rename({ sessionId: id, participantId, name: parsed.data.name });
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    // Terminer, et non supprimer : une séance jouée porte un retour qu'Elda
    // peut vouloir relire. La suppression serait une autre décision.
    await this.finish.execute({ sessionId: id });
    return { ok: true };
  }
}
