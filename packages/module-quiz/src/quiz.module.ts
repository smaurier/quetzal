import { Module } from '@nestjs/common';
import { ManageBankUseCase } from './application/manage-bank.use-case.js';
import type { QuestionBankRepository } from './domain/ports/question-bank.repository.js';
import { PrismaQuestionBankRepository } from './infrastructure/prisma-question-bank.repository.js';
import { BankController } from './presentation/bank.controller.js';

const BANKS = 'QuizQuestionBankRepository';

@Module({
  controllers: [BankController],
  providers: [
    { provide: BANKS, useClass: PrismaQuestionBankRepository },
    {
      provide: ManageBankUseCase,
      useFactory: (banks: QuestionBankRepository) => new ManageBankUseCase(banks),
      inject: [BANKS],
    },
  ],
})
export class QuizModule {}
