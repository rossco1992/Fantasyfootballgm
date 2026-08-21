export type CsvRow = Record<string, string>;

/**
 * Small RFC-4180-style parser for provider fixtures and nflverse CSV exports.
 * It supports quoted delimiters/newlines and doubled quotes without adding a
 * provider-specific parsing dependency to the domain or service layers.
 */
export function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV input ended inside a quoted field.");
  if (field.length > 0 || row.length > 0) pushRow();
  if (rows.length === 0) return [];

  const header = rows[0]!.map((value, index) =>
    index === 0 ? value.replace(/^\uFEFF/, "") : value,
  );
  if (header.some((column) => column.trim().length === 0)) {
    throw new Error("CSV headers must be non-empty.");
  }
  if (new Set(header).size !== header.length) {
    throw new Error("CSV headers must be unique.");
  }

  return rows.slice(1).flatMap((values, rowIndex) => {
    if (values.length === 1 && values[0] === "") return [];
    if (values.length > header.length) {
      throw new Error(`CSV row ${rowIndex + 2} contains too many fields.`);
    }
    return [
      Object.fromEntries(
        header.map((column, columnIndex) => [
          column,
          values[columnIndex] ?? "",
        ]),
      ),
    ];
  });
}
