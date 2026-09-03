import { describe, it, expect } from 'vitest';
import { HelloGateway } from './hello.gateway.js';

// Retro test (Issue #4, 1e9f558): ping answers pong with the measured latency.
describe('HelloGateway', () => {
  it('answers ping with pong and a non-negative latency', () => {
    const gateway = new HelloGateway();
    const client = { data: {} } as never;
    const result = gateway.handlePing({ at: Date.now() - 5 }, client);
    expect(result.event).toBe('pong');
    expect(result.data.latencyMs).toBeGreaterThanOrEqual(5);
    expect(typeof result.data.serverAt).toBe('number');
  });
});
