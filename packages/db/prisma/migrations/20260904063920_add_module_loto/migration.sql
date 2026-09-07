-- CreateTable
CREATE TABLE "Loto_Deck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loto_Deck_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_Card" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "imageId" TEXT,

    CONSTRAINT "Loto_Card_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_CardImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loto_CardImage_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_Game" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "pattern" VARCHAR(16) NOT NULL,
    "falseClaimPenaltyDraws" INTEGER NOT NULL DEFAULT 0,
    "maxTeams" INTEGER NOT NULL DEFAULT 6,
    "joinCode" VARCHAR(8) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "wonByTeamId" TEXT,

    CONSTRAINT "Loto_Game_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_GameCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "imageId" TEXT,

    CONSTRAINT "Loto_GameCard_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamIndex" INTEGER NOT NULL,
    "cardIds" JSONB NOT NULL,
    "markedCardIds" JSONB NOT NULL,
    "blockedUntilDraw" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Loto_Team_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_Member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "guestId" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(32) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loto_Member_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_Draw" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "cardId" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loto_Draw_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Loto_Claim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "atDraw" INTEGER NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loto_Claim_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateIndex
CREATE INDEX "Loto_Deck_tenantId_name_idx" ON "Loto_Deck"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Loto_Card_tenantId_deckId_idx" ON "Loto_Card"("tenantId", "deckId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_Card_deckId_rank_tenantId_key" ON "Loto_Card"("deckId", "rank", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_CardImage_contentHash_tenantId_key" ON "Loto_CardImage"("contentHash", "tenantId");

-- CreateIndex
CREATE INDEX "Loto_Game_tenantId_status_createdAt_idx" ON "Loto_Game"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_Game_joinCode_tenantId_key" ON "Loto_Game"("joinCode", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_GameCard_gameId_rank_tenantId_key" ON "Loto_GameCard"("gameId", "rank", "tenantId");

-- CreateIndex
CREATE INDEX "Loto_Team_tenantId_gameId_idx" ON "Loto_Team"("tenantId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_Team_gameId_teamIndex_tenantId_key" ON "Loto_Team"("gameId", "teamIndex", "tenantId");

-- CreateIndex
CREATE INDEX "Loto_Member_tenantId_teamId_idx" ON "Loto_Member"("tenantId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_Member_gameId_guestId_tenantId_key" ON "Loto_Member"("gameId", "guestId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_Draw_gameId_order_tenantId_key" ON "Loto_Draw"("gameId", "order", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Loto_Draw_gameId_cardId_tenantId_key" ON "Loto_Draw"("gameId", "cardId", "tenantId");

-- CreateIndex
CREATE INDEX "Loto_Claim_tenantId_gameId_claimedAt_idx" ON "Loto_Claim"("tenantId", "gameId", "claimedAt");

-- AddForeignKey
ALTER TABLE "Loto_Card" ADD CONSTRAINT "Loto_Card_deckId_tenantId_fkey" FOREIGN KEY ("deckId", "tenantId") REFERENCES "Loto_Deck"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_deckId_tenantId_fkey" FOREIGN KEY ("deckId", "tenantId") REFERENCES "Loto_Deck"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loto_GameCard" ADD CONSTRAINT "Loto_GameCard_gameId_tenantId_fkey" FOREIGN KEY ("gameId", "tenantId") REFERENCES "Loto_Game"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loto_Team" ADD CONSTRAINT "Loto_Team_gameId_tenantId_fkey" FOREIGN KEY ("gameId", "tenantId") REFERENCES "Loto_Game"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loto_Member" ADD CONSTRAINT "Loto_Member_teamId_tenantId_fkey" FOREIGN KEY ("teamId", "tenantId") REFERENCES "Loto_Team"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loto_Draw" ADD CONSTRAINT "Loto_Draw_gameId_tenantId_fkey" FOREIGN KEY ("gameId", "tenantId") REFERENCES "Loto_Game"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loto_Claim" ADD CONSTRAINT "Loto_Claim_gameId_tenantId_fkey" FOREIGN KEY ("gameId", "tenantId") REFERENCES "Loto_Game"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les valeurs contraintes le sont par CHECK et par Zod, jamais par une énumération Postgres.
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_status_check"
  CHECK ("status" IN ('draft', 'open', 'running', 'finished'));
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_pattern_check"
  CHECK ("pattern" IN ('linea', 'esquinas', 'centro', 'llena'));
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_maxTeams_check"
  CHECK ("maxTeams" >= 1);
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_penalty_check"
  CHECK ("falseClaimPenaltyDraws" >= 0);
