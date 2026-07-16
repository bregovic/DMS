-- Výkonové indexy pro filtrování/řazení výdajů (projekt+datum, stav, autor).
CREATE INDEX "Expense_projectId_date_idx" ON "Expense"("projectId", "date");
CREATE INDEX "Expense_stage_idx" ON "Expense"("stage");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
