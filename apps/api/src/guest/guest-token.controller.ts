import { Controller, Post, Body, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { rootPrisma, newId, Prisma } from '@quetzal/db';
import { signGuestToken, guestRegistry, eventBus, logger } from '@quetzal/core';
import { guestTokenRequestSchema } from './guest-token.dto';

@Controller('api/guest-token')
export class GuestTokenController {
  @Post()
  @Throttle({ default: { limit: 100, ttl: 3600_000 } })
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = guestTokenRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { tenantId, sessionId, moduleSlug, displayName } = parsed.data;

    const tm = await rootPrisma.tenantModule.findUnique({
      where: { tenantId_moduleSlug: { tenantId, moduleSlug } },
    });
    if (!tm || !tm.enabled) throw new NotFoundException('Module not active for tenant');

    const guestId = newId();
    const token = await signGuestToken({ tenantId, sessionId, moduleSlug, guestId, displayName }, 7200);

    guestRegistry.add(moduleSlug, sessionId, { guestId, displayName, joinedAt: Date.now() });

    const metadata = { guestId, moduleSlug, displayName } as Prisma.InputJsonValue;
    await rootPrisma.auditLog.create({
      data: {
        id: newId(),
        tenantId,
        userId: null,
        action: 'guest.joined',
        target: sessionId,
        metadata,
        ipAddress: req.ip ?? null,
      },
    });

    await eventBus.emit('guest.joined', { tenantId, sessionId, moduleSlug, guestId, displayName });

    logger.info({ tenantId, sessionId, moduleSlug, guestId }, 'guest joined');
    return { token, guestId };
  }
}
