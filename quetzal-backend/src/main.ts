import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000', 'https://quetzal-theta.vercel.app/'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Render fournit la variable PORT, utilisons-la avec une valeur par défaut sécurisée
  const port = parseInt(process.env.PORT || '3001');
  console.log(`Application starting on port: ${port}`);

  await app.listen(port, '0.0.0.0'); // Ajout de '0.0.0.0' pour écouter sur toutes les interfaces
}
bootstrap();
