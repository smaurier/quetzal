import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemsService } from './items/items.service';
import { ItemsController } from './items/items.controller';
import { Item, ItemSchema } from './schemas/item-test.schema';

@Module({
  imports: [
    // Chargement des variables d'environnement
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Configuration de Mongoose avec l'URI de MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),

    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class AppModule {}
