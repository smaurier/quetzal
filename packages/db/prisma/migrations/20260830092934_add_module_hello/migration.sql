-- CreateTable
CREATE TABLE "Hello_Greeting" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "message" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hello_Greeting_pkey" PRIMARY KEY ("id","tenantId")
);

-- CreateIndex
CREATE INDEX "Hello_Greeting_tenantId_userId_createdAt_idx" ON "Hello_Greeting"("tenantId", "userId", "createdAt");
