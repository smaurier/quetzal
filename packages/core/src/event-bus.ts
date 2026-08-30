import EventEmitter2 from 'eventemitter2';
import { logger } from './logging/logger.js';
import type { EventBus, EventName } from './module-contract.js';

type ErasedListener = (...args: unknown[]) => unknown;
type TypedHandler<T> = (payload: T, meta: { name: EventName }) => Promise<void> | void;

export class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter2({
    wildcard: true,
    delimiter: '.',
    maxListeners: 100,
  });

  async emit<T = unknown>(name: EventName, payload: T): Promise<void> {
    const seen = new Set<ErasedListener>();
    const listeners = [
      ...this.emitter.listeners(name),
      ...this.emitter.listeners('**' as unknown as string),
    ];
    for (const listener of listeners) {
      const erased = listener as ErasedListener;
      if (seen.has(erased)) continue;
      seen.add(erased);
      try {
        await Promise.resolve((listener as TypedHandler<T>)(payload, { name }));
      } catch (err) {
        logger.error({ err, event: name }, 'event subscriber crashed');
      }
    }
  }

  on<T = unknown>(name: EventName | EventName[] | '*.*', handler: TypedHandler<T>): void {
    const key = name === '*.*' ? '**' : name;
    if (Array.isArray(key)) {
      for (const k of key) this.emitter.on(k, handler as ErasedListener);
    } else {
      this.emitter.on(key as string, handler as ErasedListener);
    }
  }
}

export const eventBus: EventBus = new InProcessEventBus();
