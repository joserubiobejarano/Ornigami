import { neon } from "@neondatabase/serverless";
import fs from "fs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Run this with env loaded.");
  process.exit(1);
}

const sql = neon(databaseUrl);

const tables = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
`;

const columns = await sql`
  SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
`;

const indexes = await sql`
  SELECT
    tablename,
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname;
`;

const constraints = await sql`
  SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public'
  ORDER BY tc.table_name, tc.constraint_name;
`;

const output = {
  tables,
  columns,
  indexes,
  constraints,
};

fs.writeFileSync(
  "followup-db-inspection.json",
  JSON.stringify(output, null, 2)
);

console.log("Wrote followup-db-inspection.json");