export type CsvCell = string | number | null;

/** Text cells that a spreadsheet would evaluate as a formula get a leading apostrophe. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(cell: CsvCell, isText: boolean): string {
  if (cell === null) return '';
  let value = String(cell);
  if (isText && FORMULA_PREFIX.test(value)) value = `'${value}`;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * RFC 4180 CSV with CRLF line endings. `numericColumns` are written verbatim (so
 * negative amounts stay numbers); every other column is treated as untrusted text.
 */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  numericColumns: ReadonlySet<number> = new Set(),
): string {
  const lines = [header, ...rows].map((row, rowIndex) =>
    row
      .map((cell, column) => escapeCell(cell, rowIndex === 0 || !numericColumns.has(column)))
      .join(','),
  );
  return `${lines.join('\r\n')}\r\n`;
}
