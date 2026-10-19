const approvedRows = Object.freeze([
  {
    table: "users",
    columns: ["id", "email", "name"],
    rows: [["6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001", "preview.owner@ornigami.example.test", "Example Preview Owner"]],
  },
  {
    table: "profiles",
    columns: ["id", "full_name", "business_name", "city", "country", "plan", "plan_type", "plan_status"],
    rows: [["6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001", "Example Preview Owner", "Example Studio 001", "Example City", "ES", "free", "free", "free"]],
  },
  {
    table: "businesses",
    columns: ["id", "owner_user_id", "name", "business_type", "city", "country", "website", "tone", "language"],
    rows: [["6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002", "6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001", "Example Studio 001", "fictional studio", "Example City", "ES", "https://studio-001.example.test", "friendly", "en"]],
  },
  {
    table: "business_members",
    columns: ["business_id", "user_id", "role"],
    rows: [["6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002", "6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001", "owner"]],
  },
  {
    table: "reviews",
    columns: ["user_id", "business_id", "location_name", "google_review_id", "reviewer_name", "star_rating", "comment", "language_code", "status"],
    rows: [["6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001", "6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002", "Example Studio 001", "synthetic-review-0001", "Example Reviewer 001", 5, "This is fictional feedback for the private Preview display only.", "en", "new"]],
  },
]);

function tokenize(sql) {
  const tokens = [];
  let offset = 0;
  while (offset < sql.length) {
    const rest = sql.slice(offset);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { offset += whitespace[0].length; continue; }
    const lineComment = rest.match(/^--[^\r\n]*/);
    if (lineComment) { offset += lineComment[0].length; continue; }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", offset + 2);
      if (end < 0) throw new Error("unterminated block comment");
      offset = end + 2;
      continue;
    }
    const string = rest.match(/^'((?:''|[^'])*)'/);
    if (string) {
      tokens.push({ type: "literal", value: string[1].replaceAll("''", "'") });
      offset += string[0].length;
      continue;
    }
    const number = rest.match(/^\d+/);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      offset += number[0].length;
      continue;
    }
    const word = rest.match(/^[a-z_][a-z0-9_]*/i);
    if (word) {
      tokens.push({ type: "word", value: word[0].toLowerCase() });
      offset += word[0].length;
      continue;
    }
    if ("().,;".includes(sql[offset])) {
      tokens.push({ type: "punctuation", value: sql[offset] });
      offset += 1;
      continue;
    }
    throw new Error(`unsupported token at character ${offset}`);
  }
  return tokens;
}

function validateStatements(sql) {
  const tokens = tokenize(sql);
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const expect = (type, value) => {
    const token = take();
    if (!token || token.type !== type || token.value !== value) {
      throw new Error(`expected ${type} ${JSON.stringify(value)} at token ${index - 1}`);
    }
  };
  const expectWord = (value) => expect("word", value);
  const expectPunctuation = (value) => expect("punctuation", value);
  const parseLiteralList = () => {
    const values = [];
    expectPunctuation("(");
    while (true) {
      const token = take();
      if (!token || !["literal", "number"].includes(token.type)) {
        throw new Error(`expected literal value at token ${index - 1}`);
      }
      values.push(token.value);
      const separator = take();
      if (separator?.type === "punctuation" && separator.value === ")") return values;
      if (separator?.type !== "punctuation" || separator.value !== ",") {
        throw new Error(`expected comma or closing parenthesis at token ${index - 1}`);
      }
    }
  };

  expectWord("begin");
  expectPunctuation(";");
  for (const approved of approvedRows) {
    expectWord("insert");
    expectWord("into");
    expectWord("public");
    expectPunctuation(".");
    const tableToken = take();
    if (tableToken?.type !== "word") throw new Error(`expected table identifier at token ${index - 1}`);
    if (tableToken.value !== approved.table) throw new Error(`unexpected table ${tableToken.value}; expected ${approved.table}`);
    expectPunctuation("(");
    const columns = [];
    while (true) {
      const column = take();
      if (column?.type !== "word") throw new Error(`expected column identifier at token ${index - 1}`);
      columns.push(column.value);
      const separator = take();
      if (separator?.type === "punctuation" && separator.value === ")") break;
      if (separator?.type !== "punctuation" || separator.value !== ",") {
        throw new Error(`expected comma or closing parenthesis at token ${index - 1}`);
      }
    }
    if (JSON.stringify(columns) !== JSON.stringify(approved.columns)) {
      throw new Error(`columns for ${approved.table} do not match the approved fixture`);
    }
    expectWord("values");
    const rows = [parseLiteralList()];
    while (peek()?.type === "punctuation" && peek().value === ",") {
      take();
      rows.push(parseLiteralList());
    }
    if (JSON.stringify(rows) !== JSON.stringify(approved.rows)) {
      throw new Error(`row count or approved literal values mismatch for ${approved.table}`);
    }
    expectPunctuation(";");
  }
  expectWord("commit");
  expectPunctuation(";");
  if (index !== tokens.length) throw new Error(`unexpected trailing token at ${index}`);
  return approvedRows.map(({ table }) => table);
}

function validateMigrationColumns(migrationSources) {
  const errors = [];
  const migrationText = Array.isArray(migrationSources) ? migrationSources.join("\n") : String(migrationSources ?? "");
  for (const approved of approvedRows) {
    const create = migrationText.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${approved.table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
    if (!create) {
      errors.push(`canonical migrations do not declare required table ${approved.table}`);
      continue;
    }
    const columns = new Set([...create[1].matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+[A-Z][A-Z0-9_]*(?:\b|\()/gim)].map((match) => match[1].toLowerCase()));
    for (const column of approved.columns) {
      const addedLater = approved.table === "reviews" && column === "business_id"
        && /ALTER TABLE public\.reviews[\s\S]*?ADD COLUMN IF NOT EXISTS business_id\s+UUID/i.test(migrationText);
      if (!columns.has(column) && !addedLater) errors.push(`canonical migrations do not declare ${approved.table}.${column}`);
    }
  }
  return errors;
}

export function validateSyntheticStagingFixture(sql, migrationSources) {
  const errors = [];
  let insertedTables = [];
  try {
    insertedTables = validateStatements(sql);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "fixture grammar validation failed");
  }
  errors.push(...validateMigrationColumns(migrationSources));
  return { ok: errors.length === 0, errors, insertedTables, rowCounts: Object.fromEntries(approvedRows.map(({ table, rows }) => [table, rows.length])) };
}
