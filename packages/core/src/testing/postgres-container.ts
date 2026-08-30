import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

let container: StartedPostgreSqlContainer | undefined;

export async function ensureTestPostgres(): Promise<string> {
  if (!container) {
    container = await new PostgreSqlContainer('postgres:17')
      .withDatabase('quetzal_test')
      .withUsername('test')
      .withPassword('test')
      .withReuse()
      .start();
    process.env['DATABASE_URL'] = container.getConnectionUri();
    execSync('pnpm --filter @quetzal/db exec prisma migrate deploy --schema=prisma/schema.prisma', { stdio: 'inherit' });
  }
  return container.getConnectionUri();
}

export async function resetTestDatabase(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
