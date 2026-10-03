export type ParsedCsvRow = {
  customer_name?: string;
  customer_email?: string;
  service_received?: string;
  service_name?: string;
  visited_at?: string;
  source?: string;
};

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

function parseCsvRecord(record: string, recordNumber: number): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < record.length; i += 1) {
    const char = record[i]!;
    if (quoted) {
      if (char === '"' && record[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += char;
      }
      continue;
    }
    if (char === ",") {
      fields.push(value.trim());
      value = "";
      closedQuote = false;
      continue;
    }
    if (char === '"') {
      if (value.trim() || closedQuote) throw new CsvParseError(`CSV record ${recordNumber} has an unexpected quote`);
      value = "";
      quoted = true;
      continue;
    }
    if (closedQuote) {
      if (!/\s/.test(char)) throw new CsvParseError(`CSV record ${recordNumber} has characters after a closing quote`);
      continue;
    }
    value += char;
  }
  if (quoted) throw new CsvParseError(`CSV record ${recordNumber} has an unterminated quoted field`);
  fields.push(value.trim());
  return fields;
}

function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '"' && quoted && text[i + 1] === '"') {
      current += '""';
      i += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      if (current.trim()) records.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (quoted) throw new CsvParseError("CSV contains an unterminated quoted field");
  if (current.trim()) records.push(current);
  return records;
}

export function parseCsv(text: string): ParsedCsvRow[] {
  if (typeof text !== "string") throw new CsvParseError("CSV content must be text");
  const records = splitCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) throw new CsvParseError("CSV is empty");
  const headers = parseCsvRecord(records[0]!, 1).map((header) => header.toLowerCase());
  if (headers.some((header) => !header)) throw new CsvParseError("CSV headers cannot be empty");
  if (new Set(headers).size !== headers.length) throw new CsvParseError("CSV contains duplicate column names");
  if (!headers.includes("visited_at")) throw new CsvParseError("CSV must include a visited_at column");
  if (!headers.includes("customer_email")) throw new CsvParseError("CSV must include a customer_email column");

  return records.slice(1).map((record, index) => {
    const rowNumber = index + 2;
    const values = parseCsvRecord(record, rowNumber);
    if (values.length !== headers.length) {
      throw new CsvParseError(`CSV record ${rowNumber} has ${values.length} fields; expected ${headers.length}`);
    }
    const row: Record<string, string> = {};
    headers.forEach((header, headerIndex) => { row[header] = values[headerIndex] ?? ""; });
    return row as ParsedCsvRow;
  });
}
