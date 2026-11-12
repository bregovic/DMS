-- Ověření e-mailu při registraci: stávající účty se berou jako ověřené,
-- ať nikdo nepřijde o přístupy párované podle e-mailu.
UPDATE "dms"."User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL;
