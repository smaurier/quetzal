import { Injectable, OnModuleInit } from '@nestjs/common';
import { rootPrisma, newId, Prisma } from '@quetzal/db';
import { logger, tryGetCurrentTenant, eventBus, type EventName } from '@quetzal/core';

const AUDIT_EVENTS: readonly EventName[] = [
  'user.login', 'user.logout', 'user.signup',
  'guest.joined', 'guest.left', 'guest.kicked',
  'session.created', 'session.ended',
  'module.installed', 'module.enabled', 'module.disabled',
] as const;

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
    for (const evName of AUDIT_EVENTS) {
      eventBus.on(evName, async (payload) => persistAudit(evName, payload));
    }
    eventBus.on('*.*', async (payload, meta) => {
      if (meta.name.startsWith('audit.security.')) {
        await persistAudit(meta.name, payload);
      }
    });
  }
}
