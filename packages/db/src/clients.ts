import { PrismaClient } from '@prisma/client';

export type RootPrismaClient = PrismaClient & { readonly __brand: 'root' };

let _rootClient: RootPrismaClient | null = null;

export function createRootPrismaClient(): RootPrismaClient {
  if (_rootClient) return _rootClient;
  _rootClient = new PrismaClient() as RootPrismaClient;
  return _rootClient;
}

export const rootPrisma = createRootPrismaClient();
