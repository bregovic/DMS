/**
 * Jednoduchý, ale robustní parser CSV (stavový automat).
 * Podporuje uvozovky, escapované uvozovky ("") a autodetekci oddělovače (; nebo ,).
 */
export function parseCsv(input: string): string[][] {
  // odstraň BOM
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delim = semis >= commas ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // vyhoď úplně prázdné řádky
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
