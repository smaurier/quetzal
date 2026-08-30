import { describe, it, expect, vi } from 'vitest';
import { InProcessEventBus } from './event-bus.js';

describe('InProcessEventBus', () => {
  it('emits and receives an event synchronously', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on('test.event', handler);
    await bus.emit('test.event', { foo: 'bar' });
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' }, { name: 'test.event' });
  });

  it('passes event name to wildcard subscribers so they can filter', async () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.on('*.*', (_p, meta) => { seen.push(meta.name); });
    await bus.emit('audit.security.leak', { attempted: 't-B' });
    await bus.emit('user.login', { userId: 'u1' });
    expect(seen).toEqual(['audit.security.leak', 'user.login']);
  });

  it('wildcard subscribers receive all events', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on('*.*', handler);
    await bus.emit('module.event', { x: 1 });
    expect(handler).toHaveBeenCalled();
  });

  it('one handler crash does not block others (at-most-once)', async () => {
    const bus = new InProcessEventBus();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.on('test.crash', bad);
    bus.on('test.crash', good);
    await bus.emit('test.crash', {});
    expect(good).toHaveBeenCalled();
  });

  it('does not double-invoke wildcard subscribers for a specific event', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on('*.*', handler);
    await bus.emit('specific.event', { x: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
