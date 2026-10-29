import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { HealthController } from './health.controller';

const COMMIT_ENV = ['RENDER_GIT_COMMIT', 'VERCEL_GIT_COMMIT_SHA', 'GIT_COMMIT'] as const;

describe('HealthController', () => {
  let sauvegarde: Record<string, string | undefined>;

  beforeEach(() => {
    sauvegarde = Object.fromEntries(COMMIT_ENV.map((k) => [k, process.env[k]]));
    for (const k of COMMIT_ENV) delete process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(sauvegarde)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns status ok with an ISO timestamp', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('answers "unknown" when the host injected no commit', () => {
    expect(new HealthController().check().build).toBe('unknown');
  });

  // Le dépôt est public : publier le SHA en clair dirait à quiconque quelles
  // versions de dépendances tournent, donc quelles CVE connues s'appliquent.
  // L'empreinte permet de VÉRIFIER un commit attendu sans le RÉVÉLER.
  it('answers a 12-character fingerprint, never the raw commit', () => {
    const commit = '40b2c87d1f3a4b5c6d7e8f90123456789abcdef0';
    process.env.RENDER_GIT_COMMIT = commit;

    const build = new HealthController().check().build;

    expect(build).toBe(createHash('sha256').update(commit).digest('hex').slice(0, 12));
    expect(build).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(new HealthController().check())).not.toContain(commit);
    expect(build).not.toBe(commit.slice(0, 12));
  });

  it('is stable across calls, so two probes can be compared', () => {
    process.env.RENDER_GIT_COMMIT = 'abc123';
    const controller = new HealthController();
    expect(controller.check().build).toBe(controller.check().build);
  });

  it('accepts the Vercel and generic variables too, in that order of fallback', () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'vercel-sha';
    expect(new HealthController().check().build).toBe(
      createHash('sha256').update('vercel-sha').digest('hex').slice(0, 12),
    );

    delete process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.GIT_COMMIT = 'generic-sha';
    expect(new HealthController().check().build).toBe(
      createHash('sha256').update('generic-sha').digest('hex').slice(0, 12),
    );
  });

  it('prefers the Render variable when several are present', () => {
    process.env.RENDER_GIT_COMMIT = 'render-sha';
    process.env.VERCEL_GIT_COMMIT_SHA = 'vercel-sha';
    expect(new HealthController().check().build).toBe(
      createHash('sha256').update('render-sha').digest('hex').slice(0, 12),
    );
  });
});
