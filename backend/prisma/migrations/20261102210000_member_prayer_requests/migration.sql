CREATE TYPE "PrayerRequestStatus" AS ENUM ('PENDING', 'PRAYING', 'ANSWERED');

CREATE TABLE "PrayerRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "status" "PrayerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrayerRequest_userId_createdAt_idx"
ON "PrayerRequest"("userId", "createdAt");

ALTER TABLE "PrayerRequest"
ADD CONSTRAINT "PrayerRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
