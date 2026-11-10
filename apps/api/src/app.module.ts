import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { IMAGE_REFERENCE_PROVIDERS, type ImageReferenceProvider } from '@quetzal/core';
import { LotoImageReferences } from '@quetzal/module-loto';
import { HealthController } from './health.controller';
import { GuestTokenController } from './guest/guest-token.controller';
import { RequestIdMiddleware } from './middlewares/request-id.middleware';
import { JwtAuthMiddleware } from './middlewares/jwt-auth.middleware';
import { TenantMiddleware } from './middlewares/tenant.middleware';
import { AuditSubscriber } from './observability/audit.subscriber';

/**
 * ⛔ Tous les porteurs d images, et a un seul endroit. Un module qui
 * construirait son propre depot avec ses seules references ramasserait les
 * images du voisin : c est exactement le defaut que cette tache corrige.
 *
 * ⚠️ La liste ne suit PAS `MODULES`, et c est volontaire. Un module absent du
 * deploiement ne repondrait rien, donc ses images deviendraient ramassables par
 * un module present. Une classe toujours presente repond pour lui. ⛔ Si un
 * module est retire pour de bon, c est son fournisseur qu il faut retirer ici,
 * en connaissance de cause, issue a ouvrir pour ce cas.
 *
 * `porteurs-d-images.spec.ts` compte les prefixes de module qui declarent une
 * colonne `imageId` dans le schema, et exige autant de fournisseurs ici.
 */
export const PORTEURS_D_IMAGES = [LotoImageReferences] as const;

/**
 * ⚠️ `@Global()`, et ce n est pas un raccourci de confort : c est la seule
 * forme qui marche, mesuree le 10/11.
 *
 * `PrismaCardImageStore` est fourni par `useClass` DANS chaque module
 * (cf. `loto.module.ts`), donc Nest resout son
 * `@Inject(IMAGE_REFERENCE_PROVIDERS)` dans la portee de CE module. Le meme
 * fournisseur pose dans les `providers` d `AppModule` n y serait pas visible :
 * `AppModule` est un module ordinaire, importe par le `RootModule` compose dans
 * `main.ts` a cote des modules de modules, et un module ne voit pas les
 * providers de ses freres.
 *
 * ⛔ Et l echec serait MUET : `@Optional()` fait que Nest injecte `undefined`
 * au lieu de lever, le registre serait vide, et le ramassage ne ramasserait
 * plus jamais rien. C est le garde du noyau (registre vide = 0 suppression) qui
 * rattrape ce cas, et `porteurs-d-images.spec.ts` qui prouve que le tableau
 * arrive bien jusqu a un module qui n importe pas celui-ci.
 */
@Global()
@Module({
  providers: [
    ...PORTEURS_D_IMAGES,
    {
      provide: IMAGE_REFERENCE_PROVIDERS,
      useFactory: (...fournisseurs: ImageReferenceProvider[]) => fournisseurs,
      inject: [...PORTEURS_D_IMAGES],
    },
  ],
  exports: [IMAGE_REFERENCE_PROVIDERS],
})
export class ImageReferencesModule {}

@Module({
  imports: [
    ImageReferencesModule,
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
