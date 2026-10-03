-- Automatické zpracování platí ten, kdo přinesl klíč. Klíč je u uživatele
-- (šifrovaně, stejně jako heslo do datovky) a útrata se vede po účtech,
-- aby jeden účet nevyčerpal strop všem.
ALTER TABLE "dms"."User" ADD COLUMN "openaiApiKey" TEXT;

ALTER TABLE "dms"."AiUsageLog" ADD COLUMN "projectId" TEXT;

CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "dms"."AiUsageLog"("userId", "createdAt");
