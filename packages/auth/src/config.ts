import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { organization, jwt } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAccessControl, defaultStatements } from 'better-auth/plugins/access';
import { rootPrisma } from '@quetzal/db';
import { createSessionCreateHook } from './session-hooks.js';

const statements = {
  ...defaultStatements,
  tenant: ['manage'],
  module: ['configure'],
  content: ['create', 'consume'],
  session: ['launch'],
} as const;

const ac = createAccessControl(statements);

const owner = ac.newRole({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  tenant: ['manage'],
  module: ['configure'],
  content: ['create', 'consume'],
  session: ['launch'],
});

const admin = ac.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  tenant: ['manage'],
  module: ['configure'],
});

const creator = ac.newRole({
  content: ['create'],
  session: ['launch'],
});

const learner = ac.newRole({
  content: ['consume'],
});

async function findFirstOrganizationId(userId: string): Promise<string | null> {
  const member = await rootPrisma.member.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  return member?.organizationId ?? null;
}

export const auth = betterAuth({
  database: prismaAdapter(rootPrisma, { provider: 'postgresql' }),
  baseURL: process.env['HOST_URL'] ?? 'http://localhost:3000',
  secret: process.env['BETTER_AUTH_SECRET'] ?? '',
  user: {
    additionalFields: {
      locale: { type: 'string', defaultValue: 'fr' },
    },
  },
  databaseHooks: {
    session: {
      create: { before: createSessionCreateHook(findFirstOrganizationId) },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,
      organizationLimit: 1,
      membershipLimit: 100,
      ac,
      roles: { owner, admin, creator, learner },
    }) as unknown as BetterAuthPlugin,
    jwt({
      jwks: { keyPairConfig: { alg: 'RS256' } },
      jwt: {
        expirationTime: '1h',
        definePayload: ({ session, user }) => {
          const activeOrgId =
            (session as { activeOrganizationId?: string }).activeOrganizationId ?? null;
          const locale = (user as { locale?: string }).locale ?? 'fr';
          return {
            userId: user.id,
            tenantId: activeOrgId,
            locale,
          };
        },
      },
    }) as unknown as BetterAuthPlugin,
  ],
});
