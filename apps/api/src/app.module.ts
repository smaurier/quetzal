import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { GuestTokenController } from './guest/guest-token.controller';
import { RequestIdMiddleware } from './middlewares/request-id.middleware';
import { JwtAuthMiddleware } from './middlewares/jwt-auth.middleware';
import { TenantMiddleware } from './middlewares/tenant.middleware';
import { AuditSubscriber } from './observability/audit.subscriber';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 100 }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [HealthController, GuestTokenController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, AuditSubscriber],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, JwtAuthMiddleware, TenantMiddleware)
      .forRoutes('*');
  }
}
