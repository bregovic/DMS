/**
 * Konstanty pro hromadný výběr v seznamech. Samostatně (ne v "use client"
 * komponentě) – serverová stránka z klientského modulu hodnotu nedostane,
 * jen odkaz na klientskou komponentu.
 */
export const BULK_FORM_ID = "bulk-tasks";
export const PICK_ATTR = "data-pick-task";
