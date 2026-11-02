-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_key_attemptedAt_idx" ON "LoginAttempt"("key", "attemptedAt");
