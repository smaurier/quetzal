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
    { name: 'loto.pattern.won', typeRef: 'LotoPatternWonEvent' },
    { name: 'loto.game.finished', typeRef: 'LotoGameFinishedEvent' },
  ],
  permissions: {
    'http:GET /api/modules/loto/decks': ['owner', 'creator'],
    'http:GET /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:POST /api/modules/loto/decks': ['owner', 'creator'],
    'http:PATCH /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:POST /api/modules/loto/decks/:id/cards': ['owner', 'creator'],
    'http:DELETE /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:GET /api/modules/loto/games': ['owner', 'creator'],
    'http:GET /api/modules/loto/games/:id': ['owner', 'creator'],
    'http:POST /api/modules/loto/games': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/open': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/draw': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/finish': ['owner', 'creator'],
    // Issue #29 : nommer une equipe est un geste d animatrice, jamais d eleve.
    // Un invite qui pourrait renommer l equipe d en face aurait trouve un jeu
    // dans le jeu, et l ecran est projete devant la classe.
    'http:PATCH /api/modules/loto/games/:id/teams/:teamId': ['owner', 'creator'],
    'http:POST /api/modules/loto/decks/:id/cards/:rank/image': ['owner', 'creator'],
    'http:GET /api/modules/loto/images/:hash': ['owner', 'creator', 'learner', 'guest'],
    'ws:mark': ['guest', 'learner'],
    'ws:claim': ['guest', 'learner'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    /**
     * Issue #75. 60 et non 40, et le nombre vient d une MESURE, pas d une
     * intuition : scripts/mesurer-la-charge.mjs a fait entrer soixante
     * telephones sur une partie en 2129 ms de mediane, avec une diffusion a
     * 215 ms. A quarante, 1608 ms et 89 ms. Zero refus dans les deux cas.
     *
     * Durcir a 40 aurait refuse des eleves a un seuil que la mesure dit
     * atteignable sans peine. Le plafond dit maintenant ce qui a ete tenu.
     *
     * ⚠️ Il est desormais APPLIQUE, a POST /api/guest-token, et compare au
     * nombre d invites PRESENTS et non au nombre de jetons emis : le registre
     * se vide a la fermeture des sockets depuis la meme issue.
     */
    maxConcurrentPerSession: 60,
  },
  prismaModels: 'prisma/models.prisma',
};
