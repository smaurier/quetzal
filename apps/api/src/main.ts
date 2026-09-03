import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadManifests, upsertModuleCatalogue, composeAppModules } from './module-registry';
import { initSentry } from './observability/sentry';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { QuetzalIoAdapter } from './ws/quetzal-io.adapter';
import { buildWsRegistry } from './ws/ws-policies';
import { handshakeVerifiers } from './ws/handshake-verifiers';
import { WsPermissionsGuard } from './ws/ws-permissions.guard';
import helmet from 'helmet';
import { logger, eventBus } from '@quetzal/core';
import { rootPrisma } from '@quetzal/db';

async function bootstrap() {
  initSentry();

  const slugs = (process.env['MODULES'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (slugs.length === 0) {
    logger.warn('No MODULES env variable — starting with core only');
  }

  const manifests = await loadManifests(slugs);
  await upsertModuleCatalogue(manifests);

  @Module({
    imports: [AppModule, ...composeAppModules(manifests)],
  })
  class RootModule {}

  const app = await NestFactory.create(RootModule, { bufferLogs: true });

  app.useGlobalFilters(new GlobalExceptionFilter());

  // WebSockets: identity resolved once at handshake,every message checked against the manifest.
  const wsRegistry = buildWsRegistry(manifests);
  app.useWebSocketAdapter(new QuetzalIoAdapter(app, { registry: wsRegistry, verifiers: handshakeVerifiers }));
  app.useGlobalGuards(new WsPermissionsGuard(wsRegistry));

  app.use(helmet({ contentSecurityPolicy: false }));

  const hostUrl = process.env['HOST_URL'] ?? 'http://localhost:3000';
  app.enableCors({
    origin: hostUrl.split(','),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });

  const rootContext = {
    logger,
    config: process.env as Readonly<Record<string, string | undefined>>,
    eventBus,
    prisma: rootPrisma,
  };
  for (const m of manifests) {
    if (m.onBoot) await m.onBoot(rootContext);
  }

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  await app.listen(port);
  logger.info({ port, modules: slugs }, 'quetzal-api listening');
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
