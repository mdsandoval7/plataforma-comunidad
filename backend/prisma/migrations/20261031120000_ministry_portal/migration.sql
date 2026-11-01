CREATE TABLE "DepartmentMetrics" (
    "id" UUID NOT NULL,
    "ministryCode" TEXT NOT NULL,
    "churchCode" TEXT NOT NULL DEFAULT 'ciudad-camelot',
    "totalMembers" INTEGER NOT NULL DEFAULT 0,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "inactiveMembers" INTEGER NOT NULL DEFAULT 0,
    "baptizedMembers" INTEGER NOT NULL DEFAULT 0,
    "nonBaptizedMembers" INTEGER NOT NULL DEFAULT 0,
    "newMembers" INTEGER NOT NULL DEFAULT 0,
    "departedMembers" INTEGER NOT NULL DEFAULT 0,
    "peopleToConsolidate" INTEGER NOT NULL DEFAULT 0,
    "scheduledVisits" INTEGER NOT NULL DEFAULT 0,
    "completedUnplannedVisits" INTEGER NOT NULL DEFAULT 0,
    "teamMembers" INTEGER NOT NULL DEFAULT 0,
    "pastoralGoal" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentMetrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentMetrics_ministryCode_churchCode_key" ON "DepartmentMetrics"("ministryCode", "churchCode");
CREATE INDEX "DepartmentMetrics_churchCode_idx" ON "DepartmentMetrics"("churchCode");

CREATE TABLE "MinistryReport" (
    "id" UUID NOT NULL,
    "ministryCode" TEXT NOT NULL,
    "churchCode" TEXT NOT NULL DEFAULT 'ciudad-camelot',
    "reportType" TEXT NOT NULL DEFAULT 'MEETING',
    "title" TEXT NOT NULL,
    "meetingAt" TIMESTAMP(3),
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "minutes" TEXT,
    "publicDescription" TEXT,
    "proposals" TEXT,
    "pastorDirectives" TEXT,
    "budget" DECIMAL(14,2),
    "publishToWeb" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "MinistryReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicTestimonial" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "moderationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,

    CONSTRAINT "PublicTestimonial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MinistryReport_ministryCode_createdAt_idx" ON "MinistryReport"("ministryCode", "createdAt");
CREATE INDEX "MinistryReport_churchCode_status_createdAt_idx" ON "MinistryReport"("churchCode", "status", "createdAt");
CREATE INDEX "MinistryReport_publishToWeb_status_meetingAt_idx" ON "MinistryReport"("publishToWeb", "status", "meetingAt");
CREATE INDEX "PublicTestimonial_moderationStatus_createdAt_idx" ON "PublicTestimonial"("moderationStatus", "createdAt");

ALTER TABLE "Person" ADD COLUMN "churchCode" TEXT NOT NULL DEFAULT 'ciudad-camelot';
CREATE INDEX "Person_churchCode_status_deletedAt_idx" ON "Person"("churchCode", "status", "deletedAt");

ALTER TABLE "MinistryReport" ADD CONSTRAINT "MinistryReport_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicTestimonial" ADD CONSTRAINT "PublicTestimonial_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
