import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { organization, jwt } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/organization/access';
import { rootPrisma, newId } from '@quetzal/db';
import { createSessionCreateHook } from './session-hooks.js';
import { auditConnexion, auditInscription, type LigneAudit } from './audit-auth.js';
import { originesDeConfiance, urlDeBase } from './origines-de-confiance.js';

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

/**
 * Issue #60 : le journal d audit n enregistrait aucune authentification, et ne
 * pouvait pas — `AuditSubscriber` vit dans l autre processus, hors de portee du
 * bus in-process. Le host ecrit donc lui-meme, comme le fait deja
 * `guest-token.controller.ts`.
 *
 * Une ecriture d audit ne doit JAMAIS faire echouer l action qu elle observe :
 * une connexion refusee parce que son journal n a pas pu s ecrire serait un
 * remede pire que le mal. D ou le `catch` muet, qui est le seul endroit de ce
 * depot ou avaler une erreur est le bon geste.
 */
async function ecrireAudit(ligne: LigneAudit): Promise<void> {
  try {
    await rootPrisma.auditLog.create({ data: { id: newId(), ...ligne } });
  } catch {
    // volontairement muet : voir ci-dessus
  }
}

export const auth = betterAuth({
  database: prismaAdapter(rootPrisma, { provider: 'postgresql' }),
  /**
   * Issue #64 : `trustedOrigins` vaut `[baseURL]` par defaut. Tant que ces
   * deux valeurs venaient de `HOST_URL`, une variable unique devait couvrir la
   * production et chaque apercu, que Vercel sert sous des URL differentes.
   * Elles se derivent maintenant du deploiement. Voir `origines-de-confiance`.
   */
  baseURL: urlDeBase(process.env),
  trustedOrigins: [...originesDeConfiance(process.env)],
  secret: process.env['BETTER_AUTH_SECRET'] ?? '',
  user: {
    additionalFields: {
      locale: { type: 'string', defaultValue: 'fr' },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: createSessionCreateHook(findFirstOrganizationId),
        after: async (session) => {
          await ecrireAudit(auditConnexion(session));
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          await ecrireAudit(auditInscription(user));
        },
      },
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
