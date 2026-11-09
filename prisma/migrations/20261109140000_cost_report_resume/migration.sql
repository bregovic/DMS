-- Report nákladů (#48): navázání na rozběhnutou úlohu po restartu serveru.
ALTER TABLE "dms"."CostReport" ADD COLUMN "responseId" TEXT;
