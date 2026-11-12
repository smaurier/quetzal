import { Module } from '@nestjs/common';
import { PrismaCardImageStore } from '@quetzal/core/images';
import { ManageBankUseCase } from './application/manage-bank.use-case.js';
import type { QuestionBankRepository } from './domain/ports/question-bank.repository.js';
import { PrismaQuestionBankRepository } from './infrastructure/prisma-question-bank.repository.js';
import { BankController } from './presentation/bank.controller.js';
import { QuizImageController, QUIZ_IMAGE_STORE } from './presentation/image.controller.js';

const BANKS = 'QuizQuestionBankRepository';

@Module({
  controllers: [BankController, QuizImageController],
  providers: [
    { provide: BANKS, useClass: PrismaQuestionBankRepository },
    { provide: QUIZ_IMAGE_STORE, useClass: PrismaCardImageStore },
    {
      provide: ManageBankUseCase,
      useFactory: (banks: QuestionBankRepository) => new ManageBankUseCase(banks),
      inject: [BANKS],
    },
  ],
})
export class QuizModule {}
