import { Injectable } from '@nestjs/common';
import { Greeting, DisplayName } from '../domain/greeting.js';
import type { GreetingRepository } from '../domain/ports/greeting.repository.js';
import type { EventBus } from '@quetzal/core';

export interface GreetInput {
  userId: string;
  tenantId: string;
  rawName: string;
  requestId: string;
}

@Injectable()
export class GreetUseCase {
  constructor(
    private readonly repo: GreetingRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: GreetInput): Promise<Greeting> {
    const name = DisplayName.of(input.rawName);
    const greeting = Greeting.for(name);
    await this.repo.save({ userId: input.userId, message: greeting.message });
    await this.eventBus.emit('hello.greeted', {
      userId: input.userId,
      tenantId: input.tenantId,
      requestId: input.requestId,
      message: greeting.message,
    });
    return greeting;
  }
}
