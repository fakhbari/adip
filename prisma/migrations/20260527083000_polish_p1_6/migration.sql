-- Polish P1.6 — soft-deactivation flag on User.
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
