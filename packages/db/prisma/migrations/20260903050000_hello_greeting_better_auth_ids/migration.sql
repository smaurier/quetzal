-- Hello_Greeting.userId / tenantId reference Better-Auth User / Organization, whose ids are
-- plain strings (not UUIDs). Widen both columns; the composite PK and the index are rebuilt.
ALTER TABLE "Hello_Greeting" ALTER COLUMN "tenantId" TYPE TEXT;
ALTER TABLE "Hello_Greeting" ALTER COLUMN "userId" TYPE TEXT;
