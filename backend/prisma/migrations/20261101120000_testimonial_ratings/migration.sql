ALTER TABLE "PublicTestimonial"
ADD COLUMN "rating" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PublicTestimonial_moderationStatus_rating_createdAt_idx"
ON "PublicTestimonial"("moderationStatus", "rating", "createdAt");
