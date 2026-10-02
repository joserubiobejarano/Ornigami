import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/server/env";
import * as schema from "@/server/db/schema";

const sql = neon(env.DATABASE_URL);

export const db = drizzle({
  client: sql,
  schema,
});
