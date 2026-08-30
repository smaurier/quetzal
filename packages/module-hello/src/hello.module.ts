import { Module } from '@nestjs/common';
import { HelloController } from './presentation/hello.controller.js';
import { HelloGateway } from './presentation/hello.gateway.js';
import { GreetUseCase } from './application/greet.use-case.js';
import { PrismaGreetingRepository } from './infrastructure/prisma-greeting.repository.js';
import { eventBus } from '@quetzal/core';
import type { GreetingRepository } from './domain/ports/greeting.repository.js';

@Module({
  controllers: [HelloController],
  providers: [
    HelloGateway,
    { provide: 'GreetingRepository', useClass: PrismaGreetingRepository },
    {
      provide: GreetUseCase,
      useFactory: (repo: GreetingRepository) => new GreetUseCase(repo, eventBus),
      inject: ['GreetingRepository'],
    },
  ],
})
export class HelloModule {}
