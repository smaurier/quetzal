import { describe, it, expect } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns status ok with an ISO timestamp', () => {
    const controller = new HealthController();
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
