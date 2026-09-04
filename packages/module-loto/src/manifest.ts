import type { QuetzalModuleManifest } from '@quetzal/core';
import { LotoModule } from './loto.module.js';
import { clientManifest } from './client.js';

export const manifest: QuetzalModuleManifest = {
  ...clientManifest,
  description: {
    fr: 'Lotería mexicaine jouable en classe',
    en: 'Mexican lotería playable in class',
    es: 'Lotería mexicana para jugar en clase',
  },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: false,
  apiModule: LotoModule,
  eventsPublished: [
    { name: 'loto.game.started', typeRef: 'LotoGameStartedEvent' },
    { name: 'loto.card.drawn', typeRef: 'LotoCardDrawnEvent' },
    { name: 'loto.claim.rejected', typeRef: 'LotoClaimRejectedEvent' },
    { name: 'loto.game.finished', typeRef: 'LotoGameFinishedEvent' },
  ],
  permissions: {
    'http:GET /api/modules/loto/decks': ['owner', 'creator'],
    'http:POST /api/modules/loto/decks': ['owner', 'creator'],
    'http:PATCH /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:DELETE /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:GET /api/modules/loto/games': ['owner', 'creator'],
    'http:POST /api/modules/loto/games': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/open': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/draw': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/finish': ['owner', 'creator'],
    'ws:mark': ['guest', 'learner'],
    'ws:claim': ['guest', 'learner'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    maxConcurrentPerSession: 40,
  },
  prismaModels: 'prisma/models.prisma',
};
