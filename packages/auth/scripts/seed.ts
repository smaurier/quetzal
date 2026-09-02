#!/usr/bin/env tsx
import { auth } from '../src/index.js';
import { rootPrisma, newId } from '@quetzal/db';

const OWNER_EMAIL = process.env['SEED_OWNER_EMAIL'];
const OWNER_PASSWORD = process.env['SEED_OWNER_PASSWORD'];
const OWNER_NAME = 'Elda';
const TENANT_SLUG = 'default';
const TENANT_NAME = 'Elda';

if (process.env['NODE_ENV'] === 'production') {
  console.error('[seed] REFUSED: NODE_ENV=production');
  process.exit(1);
}

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('[seed] SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD required');
  process.exit(1);
}

async function main() {
  console.log('[seed] Checking existing owner...');
  const existing = await rootPrisma.user.findUnique({ where: { email: OWNER_EMAIL! } });
  if (existing) {
    console.log(`[seed] User ${OWNER_EMAIL} already exists — skipping user creation`);
  } else {
    console.log(`[seed] Creating user ${OWNER_EMAIL}...`);
    await auth.api.signUpEmail({
      body: { email: OWNER_EMAIL!, password: OWNER_PASSWORD!, name: OWNER_NAME },
    });
  }

  const user = await rootPrisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL! } });

  console.log(`[seed] Ensuring tenant "${TENANT_SLUG}"...`);
  const org = await rootPrisma.organization.upsert({
    where: { slug: TENANT_SLUG },
    create: {
      id: newId(),
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      createdAt: new Date(),
    },
    update: {},
  });

  console.log(`[seed] Ensuring membership owner...`);
  await rootPrisma.member.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: {
      id: newId(),
      userId: user.id,
      organizationId: org.id,
      role: 'owner',
      createdAt: new Date(),
    },
    update: { role: 'owner' },
  });

  console.log(`[seed] Registering module hello in catalogue...`);
  await rootPrisma.module.upsert({
    where: { slug: 'hello' },
    create: {
      slug: 'hello',
      version: '0.1.0',
      contractVersion: '1.0.0',
      enabledByDefault: true,
      metadata: { name: { fr: 'Hello', en: 'Hello', es: 'Hello' } },
    },
    update: {},
  });

  console.log(`[seed] Activating hello for tenant default...`);
  await rootPrisma.tenantModule.upsert({
    where: { tenantId_moduleSlug: { tenantId: org.id, moduleSlug: 'hello' } },
    create: { tenantId: org.id, moduleSlug: 'hello', enabled: true },
    update: { enabled: true },
  });

  console.log('[seed] Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => rootPrisma.$disconnect());
