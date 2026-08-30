import { describe, it, expect, vi } from 'vitest';
import { GreetUseCase } from './greet.use-case.js';
import type { GreetingRepository } from '../domain/ports/greeting.repository.js';
import type { EventBus } from '@quetzal/core';

const makeFakeRepo = (): GreetingRepository & { save: ReturnType<typeof vi.fn> } => ({
  save: vi.fn(async (input: { userId: string; message: string }) => ({ id: 'g1', ...input })),
});

const makeFakeBus = (): EventBus & { emit: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } => ({
  emit: vi.fn(async () => {}),
  on: vi.fn(),
});

describe('GreetUseCase', () => {
  it('greets a user with their display name', async () => {
    const repo = makeFakeRepo();
    const bus = makeFakeBus();
    const useCase = new GreetUseCase(repo, bus);
    const result = await useCase.execute({ userId: 'u1', rawName: 'Elda', tenantId: 't1', requestId: 'r1' });
    expect(result.message).toBe('Hello Elda');
  });

  it('persists the greeting through the repository', async () => {
    const repo = makeFakeRepo();
    const useCase = new GreetUseCase(repo, makeFakeBus());
    await useCase.execute({ userId: 'u1', rawName: 'Elda', tenantId: 't1', requestId: 'r1' });
    expect(repo.save).toHaveBeenCalledWith({ userId: 'u1', message: 'Hello Elda' });
  });

  it('emits hello.greeted event', async () => {
    const bus = makeFakeBus();
    const useCase = new GreetUseCase(makeFakeRepo(), bus);
    await useCase.execute({ userId: 'u1', rawName: 'Elda', tenantId: 't1', requestId: 'r1' });
    expect(bus.emit).toHaveBeenCalledWith('hello.greeted', expect.objectContaining({ userId: 'u1', tenantId: 't1', message: 'Hello Elda' }));
  });
});
