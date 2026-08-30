import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { GreetingRepository, GreetingRecord } from '../domain/ports/greeting.repository.js';

interface HelloGreetingModel {
  create(args: { data: { id: string; userId: string; message: string } }): Promise<{ id: string; userId: string; message: string }>;
}

interface PrismaWithHelloGreeting {
  hello_Greeting: HelloGreetingModel;
}

@Injectable()
export class PrismaGreetingRepository implements GreetingRepository {
  async save(input: { userId: string; message: string }): Promise<GreetingRecord> {
    const prisma = getTenantScopedPrisma() as unknown as PrismaWithHelloGreeting;
    const id = newId();
    const row = await prisma.hello_Greeting.create({
      data: { id, userId: input.userId, message: input.message },
    });
    return { id: row.id, userId: row.userId, message: row.message };
  }
}
