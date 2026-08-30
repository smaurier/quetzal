import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ensureTestPostgres, resetTestDatabase } from '@quetzal/core/testing/index';

const SEED_PATH = resolve(import.meta.dirname, '../prisma/seed.ts');

function runSeed(databaseUrl: string) {
  const result = spawnSync(
    'node',
    ['--import', 'tsx', SEED_PATH],
    {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        SEED_OWNER_EMAIL: 'test-owner@quetzal.dev',
        SEED_OWNER_PASSWORD: 'TestSeedPassword_1234567890!',
        NODE_ENV: 'development',
      },
      encoding: 'utf8',
    },
  );
  return result;
}

describe('seed idempotence (integration)', () => {
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = await ensureTestPostgres();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('is idempotent: two consecutive runs leave the same row counts', async () => {
    const first = runSeed(databaseUrl);
    expect(first.status, first.stderr).toBe(0);

    const root = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const [users1, orgs1, members1, mods1, tms1] = await Promise.all([
        root.user.count(),
        root.organization.count(),
        root.member.count(),
        root.module.count(),
        root.tenantModule.count(),
      ]);
      expect({ users1, orgs1, members1, mods1, tms1 }).toEqual({ users1: 1, orgs1: 1, members1: 1, mods1: 1, tms1: 1 });

      const second = runSeed(databaseUrl);
      expect(second.status, second.stderr).toBe(0);

      const [users2, orgs2, members2, mods2, tms2] = await Promise.all([
        root.user.count(),
        root.organization.count(),
        root.member.count(),
        root.module.count(),
        root.tenantModule.count(),
      ]);
      expect({ users2, orgs2, members2, mods2, tms2 }).toEqual({ users2: 1, orgs2: 1, members2: 1, mods2: 1, tms2: 1 });
    } finally {
      await root.$disconnect();
    }
  });
});
