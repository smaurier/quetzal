-- CreateTable
CREATE TABLE "Quiz_Session" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'brouillon',
    "maxParticipants" INTEGER NOT NULL,
    "joinCode" VARCHAR(8) NOT NULL,
    "defaultTimeLimit" INTEGER,
    "guestLocale" VARCHAR(5),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_Session_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_SessionQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,
    "prompt" VARCHAR(400) NOT NULL,
    "imageId" TEXT,
    "imageAlt" VARCHAR(200),
    "answerMode" VARCHAR(8) NOT NULL,
    "timeLimitResolved" INTEGER,
    "accentsSensibles" BOOLEAN NOT NULL DEFAULT true,
    "casseSensible" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL,
    "acceptedAnswers" JSONB NOT NULL,
    "openedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_SessionQuestion_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_Participant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantIndex" INTEGER NOT NULL,
    "name" VARCHAR(40),
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_Participant_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_Member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "displayName" VARCHAR(32) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_Member_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_Answer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "authorGuestId" TEXT NOT NULL,
    "optionId" TEXT,
    "value" VARCHAR(160),
    "isCorrect" BOOLEAN NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_Answer_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateIndex
CREATE INDEX "Quiz_Session_tenantId_idx" ON "Quiz_Session"("tenantId");

-- CreateIndex
CREATE INDEX "Quiz_Session_tenantId_joinCode_idx" ON "Quiz_Session"("tenantId", "joinCode");

-- CreateIndex
CREATE INDEX "Quiz_SessionQuestion_tenantId_sessionId_idx" ON "Quiz_SessionQuestion"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_SessionQuestion_sessionId_rank_tenantId_key" ON "Quiz_SessionQuestion"("sessionId", "rank", "tenantId");

-- CreateIndex
CREATE INDEX "Quiz_Participant_tenantId_sessionId_idx" ON "Quiz_Participant"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_Participant_sessionId_participantIndex_tenantId_key" ON "Quiz_Participant"("sessionId", "participantIndex", "tenantId");

-- CreateIndex
CREATE INDEX "Quiz_Member_tenantId_participantId_idx" ON "Quiz_Member"("tenantId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_Member_participantId_guestId_tenantId_key" ON "Quiz_Member"("participantId", "guestId", "tenantId");

-- CreateIndex
CREATE INDEX "Quiz_Answer_tenantId_sessionQuestionId_idx" ON "Quiz_Answer"("tenantId", "sessionQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_Answer_sessionQuestionId_participantId_tenantId_key" ON "Quiz_Answer"("sessionQuestionId", "participantId", "tenantId");

-- AddForeignKey
ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_deckId_tenantId_fkey" FOREIGN KEY ("deckId", "tenantId") REFERENCES "Quiz_Deck"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_SessionQuestion" ADD CONSTRAINT "Quiz_SessionQuestion_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "Quiz_Session"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_Participant" ADD CONSTRAINT "Quiz_Participant_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "Quiz_Session"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_Member" ADD CONSTRAINT "Quiz_Member_participantId_tenantId_fkey" FOREIGN KEY ("participantId", "tenantId") REFERENCES "Quiz_Participant"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_Answer" ADD CONSTRAINT "Quiz_Answer_sessionQuestionId_tenantId_fkey" FOREIGN KEY ("sessionQuestionId", "tenantId") REFERENCES "Quiz_SessionQuestion"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_Answer" ADD CONSTRAINT "Quiz_Answer_participantId_tenantId_fkey" FOREIGN KEY ("participantId", "tenantId") REFERENCES "Quiz_Participant"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CLAUDE.md §9 : pas d'enum Postgres (ALTER TYPE bloquant), mais String +
-- CHECK + Zod. La CHECK est le dernier rempart, Zod refuse avant.
ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_mode_check"
  CHECK ("mode" IN ('defi', 'controle'));

ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_status_check"
  CHECK ("status" IN ('brouillon', 'ouverte', 'en-cours', 'terminee'));

ALTER TABLE "Quiz_SessionQuestion" ADD CONSTRAINT "Quiz_SessionQuestion_answerMode_check"
  CHECK ("answerMode" IN ('choix', 'saisie'));

-- Les bornes de la spec § 3.3, en base aussi : une valeur hors bornes écrite
-- directement rendrait une séance injouable sans qu'aucun écran ne le dise.
ALTER TABLE "Quiz_SessionQuestion" ADD CONSTRAINT "Quiz_SessionQuestion_timeLimit_check"
  CHECK ("timeLimitResolved" IS NULL OR ("timeLimitResolved" >= 3 AND "timeLimitResolved" <= 120));

ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_defaultTimeLimit_check"
  CHECK ("defaultTimeLimit" IS NULL OR ("defaultTimeLimit" >= 3 AND "defaultTimeLimit" <= 120));

-- Un participant au plus, et au moins un : une séance à zéro participant
-- maximum ne pourrait accueillir personne.
ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_maxParticipants_check"
  CHECK ("maxParticipants" >= 1 AND "maxParticipants" <= 60);

-- ⛔ Une réponse porte soit un identifiant de proposition, soit une valeur
-- saisie, jamais ni l'un ni l'autre : une ligne vide serait une réponse
-- indéchiffrable dans le retour de séance.
ALTER TABLE "Quiz_Answer" ADD CONSTRAINT "Quiz_Answer_option_ou_valeur_check"
  CHECK ("optionId" IS NOT NULL OR "value" IS NOT NULL);

-- Les points ne sont jamais négatifs : la propriété 1 de D7 en base.
ALTER TABLE "Quiz_Answer" ADD CONSTRAINT "Quiz_Answer_points_check"
  CHECK ("points" >= 0);
