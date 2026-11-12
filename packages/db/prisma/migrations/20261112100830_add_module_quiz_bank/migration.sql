-- CreateTable
CREATE TABLE "Quiz_Deck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_Deck_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_Question" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "prompt" VARCHAR(400) NOT NULL,
    "imageId" TEXT,
    "imageAlt" VARCHAR(200),
    "answerMode" VARCHAR(8) NOT NULL,
    "timeLimit" INTEGER,
    "accentsSensibles" BOOLEAN NOT NULL DEFAULT true,
    "casseSensible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_Question_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_Option" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" VARCHAR(160),
    "imageId" TEXT,
    "imageAlt" VARCHAR(200),
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Quiz_Option_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateTable
CREATE TABLE "Quiz_AcceptedAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" VARCHAR(160) NOT NULL,

    CONSTRAINT "Quiz_AcceptedAnswer_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateIndex
CREATE INDEX "Quiz_Deck_tenantId_idx" ON "Quiz_Deck"("tenantId");

-- CreateIndex
CREATE INDEX "Quiz_Question_tenantId_deckId_idx" ON "Quiz_Question"("tenantId", "deckId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_Question_deckId_rank_tenantId_key" ON "Quiz_Question"("deckId", "rank", "tenantId");

-- CreateIndex
CREATE INDEX "Quiz_Option_tenantId_questionId_idx" ON "Quiz_Option"("tenantId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_Option_questionId_rank_tenantId_key" ON "Quiz_Option"("questionId", "rank", "tenantId");

-- CreateIndex
CREATE INDEX "Quiz_AcceptedAnswer_tenantId_questionId_idx" ON "Quiz_AcceptedAnswer"("tenantId", "questionId");

-- AddForeignKey
ALTER TABLE "Quiz_Question" ADD CONSTRAINT "Quiz_Question_deckId_tenantId_fkey" FOREIGN KEY ("deckId", "tenantId") REFERENCES "Quiz_Deck"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_Option" ADD CONSTRAINT "Quiz_Option_questionId_tenantId_fkey" FOREIGN KEY ("questionId", "tenantId") REFERENCES "Quiz_Question"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz_AcceptedAnswer" ADD CONSTRAINT "Quiz_AcceptedAnswer_questionId_tenantId_fkey" FOREIGN KEY ("questionId", "tenantId") REFERENCES "Quiz_Question"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CLAUDE.md §9 : pas d'enum Postgres (ALTER TYPE bloquant), mais String +
-- CHECK + Zod. La CHECK est le dernier rempart ; le schema Zod de la route
-- refuse avant d'arriver ici.
ALTER TABLE "Quiz_Question" ADD CONSTRAINT "Quiz_Question_answerMode_check"
  CHECK ("answerMode" IN ('choix', 'saisie'));

-- Une proposition sans texte NI image n'a rien a afficher. Le domaine le
-- refuse deja, et cette CHECK empeche qu'une ecriture directe en base cree
-- une question injouable.
ALTER TABLE "Quiz_Option" ADD CONSTRAINT "Quiz_Option_label_ou_image_check"
  CHECK ("label" IS NOT NULL OR "imageId" IS NOT NULL);
