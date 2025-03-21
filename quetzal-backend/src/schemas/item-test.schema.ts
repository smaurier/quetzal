import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Item extends Document {
  @Prop({ required: true })
  name: string;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
