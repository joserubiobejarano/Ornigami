const allowedColumns = Object.freeze({
  users: new Set(["id", "email", "name"]),
  profiles: new Set(["id", "full_name", "business_name", "city", "country", "plan", "plan_type", "plan_status"]),
  businesses: new Set(["id", "owner_user_id", "name", "business_type", "city", "country", "website", "tone", "language"]),
  business_members: new Set(["business_id", "user_id", "role"]),
  reviews: new Set(["user_id", "business_id", "location_name", "google_review_id", "reviewer_name", "star_rating", "comment", "language_code", "status"]),
});
const requiredColumns = Object.freeze({
  users: new Set(["id", "email", "name"]),
  profiles: new Set(["id", "full_name", "business_name", "city", "country", "plan", "plan_type", "plan_status"]),
  businesses: new Set(["id", "owner_user_id", "name", "business_type", "city", "country", "website", "tone", "language"]),
  business_members: new Set(["business_id", "user_id", "role"]),
  reviews: new Set(["user_id", "business_id", "location_name", "google_review_id", "reviewer_name", "star_rating", "comment", "language_code", "status"]),
});

function withoutSqlComments(sql) {
  return sql.replace(/--[^\r\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function validateSyntheticStagingFixture(sql, migrationSources) {
  const errors = [];
  const source = withoutSqlComments(sql);
  const statements = source.split(";").map((statement) => statement.trim()).filter(Boolean);
  if (statements.shift()?.toUpperCase() !== "BEGIN") errors.push("fixture must begin a transaction");
  if (statements.pop()?.toUpperCase() !== "COMMIT") errors.push("fixture must commit its transaction");

  const insertedTables = [];
  for (const statement of statements) {
    const match = statement.match(/^INSERT\s+INTO\s+public\.([a-z_]+)\s*\(([^)]+)\)\s*VALUES\b/i);
    if (!match) {
      errors.push("fixture contains a non-allowlisted SQL statement");
      continue;
    }
    const table = match[1].toLowerCase();
    const columns = match[2].split(",").map((column) => column.trim().toLowerCase());
    const allowlist = allowedColumns[table];
    if (!allowlist) {
      errors.push(`fixture inserts into disallowed table ${table}`);
      continue;
    }
    insertedTables.push(table);
    if (new Set(columns).size !== columns.length || columns.some((column) => !allowlist.has(column))) {
      errors.push(`fixture uses a disallowed or duplicate column in ${table}`);
    }
  }

  const expectedTables = ["users", "profiles", "businesses", "business_members", "reviews"];
  if (expectedTables.some((table) => !insertedTables.includes(table))) errors.push("fixture is missing a required synthetic display table");
  if (insertedTables.some((table) => !expectedTables.includes(table))) errors.push("fixture contains unexpected table data");
  if (!/preview\.owner@ornigami\.example\.test/i.test(source)) errors.push("fixture identity must use the reserved example.test domain");
  if (!/https:\/\/studio-001\.example\.test/i.test(source)) errors.push("fixture website must use the reserved example.test domain");
  if (!/synthetic-review-0001/i.test(source) || !/fictional feedback/i.test(source)) errors.push("review content must be explicitly synthetic");

  const forbidden = /(?:password_hash|access_token|refresh_token|api[_-]?key|secret|stripe_customer_id|google_operation_id|send_at|scheduled_at|cron|delivery|webhook|https?:\/\/(?!studio-001\.example\.test)[^\s'"),;]+)/i;
  if (forbidden.test(source)) errors.push("fixture contains a credential, provider, delivery, schedule, or non-example URL marker");

  const migrationText = Array.isArray(migrationSources) ? migrationSources.join("\n") : String(migrationSources ?? "");
  for (const table of ["users", "profiles", "businesses", "business_members", "reviews"]) {
    const create = migrationText.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
    if (!create) {
      errors.push(`canonical migrations do not declare required table ${table}`);
      continue;
    }
    const declaredColumns = new Set([...create[1].matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+[A-Z][A-Z0-9_]*(?:\b|\()/gim)].map((match) => match[1].toLowerCase()));
    for (const column of requiredColumns[table]) {
      const addedLater = table === "reviews" && column === "business_id"
        && /ALTER TABLE public\.reviews[\s\S]*?ADD COLUMN IF NOT EXISTS business_id\s+UUID/i.test(migrationText);
      if (!declaredColumns.has(column) && !addedLater) errors.push(`canonical migrations do not declare ${table}.${column}`);
    }
  }
  return { ok: errors.length === 0, errors, insertedTables };
}
