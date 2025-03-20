import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Appliquer CORS pour toutes les requêtes venant de Vercel et localhost
  app.enableCors({
    origin: ['https://quetzal-theta.vercel.app', 'http://localhost:3000'], // Listes des origines autorisées
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Permet l'accès aux cookies et autres informations de session
    allowedHeaders: 'Content-Type, Accept, Authorization', // Ajout des en-têtes nécessaires
  });

  const port = parseInt(process.env.PORT || '3001');
  console.log(`Application starting on port: ${port}`);

  await app.listen(port, '0.0.0.0'); // Assure-toi que l'application écoute sur toutes les interfaces
}
bootstrap();
