import { Injectable, OnModuleInit } from '@nestjs/common';
import { rootPrisma, newId, Prisma } from '@quetzal/db';
import { logger, tryGetCurrentTenant, eventBus } from '@quetzal/core';

/**
 * ⚠️ IL N Y A PLUS DE LISTE DE NOMS ICI, ET C EST DELIBERE (issue #60).
 *
 * Cette liste en comptait onze. Mesure du 05/11 : **un seul** etait emis,
 * `guest.joined`, et les dix autres ne pouvaient pas l etre. Le bus est
 * in-process (`CLAUDE.md` §6), Better-Auth vit dans le host, et host et API
 * sont deux processus : un `emit('user.login')` depuis les hooks de session
 * n atteindrait jamais cet abonne.
 *
 * Pire, le seul nom qui marchait etait persiste DEUX FOIS :
 * `guest-token.controller.ts` ecrit la ligne en direct — avec l adresse IP,
 * que `persistAudit` ne pose pas — puis emet l evenement, que cet abonne
 * persistait a son tour. Verifie en base : exactement deux lignes par invite.
 *
 * Desormais, **ce qui ecrit sait ce qu il ecrit** :
 * - `user.login` et `user.signup` par les hooks Better-Auth du host
 *   (`packages/auth/src/audit-auth.ts`), du bon cote de la frontiere ;
 * - `guest.joined` par son controleur, qui seul connait l IP ;
 * - et par le bus, uniquement les `audit.security.*` ci-dessous, qui sont
 *   emis depuis l API donc atteignables.
 *
 * `apps/api/src/observability/audit-evenements-ecoutes.spec.ts` interdit
 * qu une liste de noms morts revienne ici.
 */

interface AuditablePayload {
  tenantId?: string;
  userId?: string;
  target?: string;
  [key: string]: unknown;
}

async function persistAudit(evName: string, payload: unknown): Promise<void> {
  const p = (payload ?? {}) as AuditablePayload;
  try {
    const ctx = tryGetCurrentTenant();
    const metadata = p as unknown as Prisma.InputJsonValue;
    await rootPrisma.auditLog.create({
      data: {
        id: newId(),
        tenantId: p.tenantId ?? ctx?.tenantId ?? null,
        userId: p.userId ?? ctx?.userId ?? null,
        action: evName,
        target: p.target ?? null,
        metadata,
      },
    });
  } catch (err) {
    logger.error({ err, evName }, 'AuditSubscriber failed');
  }
}

@Injectable()
export class AuditSubscriber implements OnModuleInit {
  onModuleInit(): void {
    eventBus.on('*.*', async (payload, meta) => {
      if (meta.name.startsWith('audit.security.')) {
        await persistAudit(meta.name, payload);
      }
    });
  }
}
