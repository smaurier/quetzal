import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { rootPrisma } from '@quetzal/db';
import { GreetUseCase } from '../application/greet.use-case.js';

@Controller('api/modules/hello')
export class HelloController {
  constructor(private readonly greet: GreetUseCase) {}

  @Get('greet')
  async doGreet() {
    const ctx = getCurrentTenant();
    if (!ctx.userId) throw new UnauthorizedException('User required for greet');
    const user = await rootPrisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const greeting = await this.greet.execute({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      rawName: user.name ?? 'Anonymous',
      requestId: ctx.requestId,
    });
    return { msg: greeting.message, tenantId: ctx.tenantId, requestId: ctx.requestId };
  }
}
