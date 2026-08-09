export type ParsedCsvRow = {
  customer_name?: string;
  customer_email?: string;
  service_received?: string;
  service_name?: string;
  visited_at?: string;
  source?: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (inQuotes) throw new Error("CSV contains an unterminated quoted field");
  result.push(current.trim());
  return result;
}

function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '""';
      i += 1;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      if (current.trim().length > 0) records.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (inQuotes) throw new Error("CSV contains an unterminated quoted field");
  if (current.trim().length > 0) records.push(current);
  return records;
}

export function parseCsv(text: string): ParsedCsvRow[] {
  const records = splitCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) return [];
  const headers = parseCsvLine(records[0]).map((header) => header.trim().toLowerCase());
  return records.slice(1).map((record) => {
    const values = parseCsvLine(record);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
    return row as ParsedCsvRow;
  });
}