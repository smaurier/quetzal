import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadManifests, upsertModuleCatalogue, composeAppModules } from './module-registry';
import helmet from 'helmet';
import { logger, eventBus } from '@quetzal/core';
import { rootPrisma } from '@quetzal/db';

async function bootstrap() {
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
