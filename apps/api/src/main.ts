import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { logger } from '@quetzal/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  const originsRaw = process.env['HOST_URL'] ?? 'http://localhost:3000';
  app.enableCors({
    origin: originsRaw.split(','),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  await app.listen(port);
  logger.info({ port }, 'quetzal-api listening');
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
