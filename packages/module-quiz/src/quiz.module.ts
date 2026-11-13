import { Module } from '@nestjs/common';
import { eventBus } from '@quetzal/core';
import { PrismaCardImageStore } from '@quetzal/core/images';
import { FinishSessionUseCase } from './application/finish-session.use-case.js';
import { ManageBankUseCase } from './application/manage-bank.use-case.js';
import { ManageSessionUseCase } from './application/manage-session.use-case.js';
import { RunQuestionUseCase, type Horloge } from './application/run-question.use-case.js';
import { SessionReportUseCase } from './application/session-report.use-case.js';
import type { QuestionBankRepository } from './domain/ports/question-bank.repository.js';
import type { SessionRepository } from './domain/ports/session.repository.js';
import { PrismaQuestionBankRepository } from './infrastructure/prisma-question-bank.repository.js';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
import { BankController } from './presentation/bank.controller.js';
import { QuizImageController, QUIZ_IMAGE_STORE } from './presentation/image.controller.js';
import { SessionController } from './presentation/session.controller.js';

const BANKS = 'QuizQuestionBankRepository';
export const QUIZ_SESSIONS = 'QuizSessionRepository';
const HORLOGE = 'QuizHorloge';

const horlogeMurale: Horloge = () => Date.now();

@Module({
  controllers: [BankController, QuizImageController, SessionController],
  providers: [
    { provide: BANKS, useClass: PrismaQuestionBankRepository },
    { provide: QUIZ_SESSIONS, useClass: PrismaSessionRepository },
    { provide: QUIZ_IMAGE_STORE, useClass: PrismaCardImageStore },
    { provide: HORLOGE, useValue: horlogeMurale },
    {
      provide: ManageBankUseCase,
      useFactory: (banks: QuestionBankRepository) => new ManageBankUseCase(banks),
      inject: [BANKS],
    },
    {
      provide: ManageSessionUseCase,
      useFactory: (sessions: SessionRepository, banks: QuestionBankRepository) =>
        new ManageSessionUseCase(sessions, banks, eventBus),
      inject: [QUIZ_SESSIONS, BANKS],
    },
    {
      provide: RunQuestionUseCase,
      useFactory: (sessions: SessionRepository, maintenant: Horloge) =>
        new RunQuestionUseCase(sessions, maintenant, eventBus),
      inject: [QUIZ_SESSIONS, HORLOGE],
    },
    {
      provide: FinishSessionUseCase,
      useFactory: (sessions: SessionRepository, maintenant: Horloge) =>
        new FinishSessionUseCase(sessions, maintenant, eventBus),
      inject: [QUIZ_SESSIONS, HORLOGE],
    },
    {
      provide: SessionReportUseCase,
      useFactory: (sessions: SessionRepository) => new SessionReportUseCase(sessions),
      inject: [QUIZ_SESSIONS],
    },
  ],
})
export class QuizModule {}
