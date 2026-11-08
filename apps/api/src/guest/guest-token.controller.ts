import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { rootPrisma, newId, Prisma } from '@quetzal/db';
import {
  signGuestToken,
  guestRegistry,
  guestPolicies,
  admitGuest,
  eventBus,
  logger,
} from '@quetzal/core';
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

    // Issue #75. ⛔ AVANT de signer : signer puis refuser laisserait un jeton
    // valide dans la nature, une entrée au registre, une ligne d'audit et un
    // événement `guest.joined` pour un élève qui n'est pas entré.
    const admission = admitGuest(
      guestPolicies.forModule(moduleSlug),
      guestRegistry.count(moduleSlug, sessionId),
    );
    if (admission.kind === 'refused') {
      logger.info(
        { tenantId, sessionId, moduleSlug, code: admission.code, max: admission.max },
        'guest refused',
      );
      // Le corps porte le CODE, que l'écran de l'élève traduit. Rendre un
      // statut nu afficherait « 409 » sur son téléphone : `guest-join.tsx`
      // faisait `setTokenError(String(res.status))`.
      if (admission.code === 'guests_not_allowed') {
        throw new ForbiddenException({
          error: 'guests_not_allowed',
          message: `Module ${moduleSlug} does not accept guests`,
        });
      }
      // 409 et non 403 : la demande est légitime et le refus est temporaire,
      // il tient à l'état de la séance. Un 403 dirait « jamais ».
      throw new HttpException(
        {
          error: 'guest_session_full',
          message: `Session is full (${String(admission.max)} guests)`,
          max: admission.max,
        },
        HttpStatus.CONFLICT,
      );
    }

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
