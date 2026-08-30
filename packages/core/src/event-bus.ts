import EventEmitter2 from 'eventemitter2';
import { logger } from './logging/logger.js';
import type { EventBus, EventName } from './module-contract.js';

export class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter2({
    wildcard: true,
    delimiter: '.',
    maxListeners: 100,
  });

  async emit<T = unknown>(name: EventName, payload: T): Promise<void> {
    const seen = new Set<Function>();
    // eventemitter2 wildcard '**' matches everything but isn't part of typed EventName
    const listeners = [
      ...this.emitter.listeners(name),
      ...this.emitter.listeners('**' as unknown as string),
    ];
    for (const listener of listeners) {
      if (seen.has(listener as Function)) continue;
      seen.add(listener as Function);
      try {
        // eventemitter2 listeners are untyped variadic — cast at boundary only
        await Promise.resolve((listener as (p: T) => unknown)(payload));
      } catch (err) {
        logger.error({ err, event: name }, 'event subscriber crashed');
      }
    }
  }

  on<T = unknown>(name: EventName | EventName[] | '*.*', handler: (payload: T) => Promise<void> | void): void {
    const key = name === '*.*' ? '**' : name;
    if (Array.isArray(key)) {
      for (const k of key) this.emitter.on(k, handler as (...args: unknown[]) => void);
    } else {
      this.emitter.on(key as string, handler as (...args: unknown[]) => void);
    }
  }
}

export const eventBus: EventBus = new InProcessEventBus();
