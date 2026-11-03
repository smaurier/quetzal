import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { resetRootPrismaClient } from '@quetzal/db';

let container: StartedPostgreSqlContainer | undefined;
let containerUrl: string | undefined;

export async function ensureTestPostgres(): Promise<string> {
  if (!container) {
    container = await new PostgreSqlContainer('postgres:17')
      .withDatabase('quetzal_test')
      .withUsername('test')
      .withPassword('test')
      // No .withReuse(): every package's integration suite gets its own container.
      // A reused container is shared by core/auth/module-hello when turbo runs them in
      // parallel, and one suite's TRUNCATE lands in the middle of another's inserts (P2003).
      .start();
    containerUrl = container.getConnectionUri();
    process.env['DATABASE_URL'] = containerUrl;
    // rootPrisma is memoized on first access and binds to DATABASE_URL at that moment.
    // When the environment already carried one (a CI service database, a local .env),
    // the application stayed bound to it while resetTestDatabase truncated this
    // container: the suite then read a database nobody ever cleaned.
    await resetRootPrismaClient();
    execSync('pnpm --filter @quetzal/db exec prisma migrate deploy --schema=prisma/schema.prisma', { stdio: 'inherit' });
  }
  return containerUrl!;
}

export async function resetTestDatabase(): Promise<void> {
  if (!containerUrl) {
    throw new Error('resetTestDatabase() sans ensureTestPostgres() : refus de tronquer une base inconnue');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: containerUrl } } });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length === 0) {
      throw new Error('resetTestDatabase() : aucune table a tronquer, les migrations ont-elles tourne ?');
    }
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`
    );
  } finally {
    await prisma.$disconnect();
  }
}
