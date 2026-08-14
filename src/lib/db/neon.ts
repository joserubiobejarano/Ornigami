import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getRequiredEnv } from "@/lib/env";

let sqlInstance: NeonQueryFunction<false, false> | undefined;

export function getSql(): NeonQueryFunction<false, false> {
  if (!sqlInstance) {
    const url = getRequiredEnv("DATABASE_URL");
    sqlInstance = neon(url);
  }
  return sqlInstance;
}

/** Tagged template SQL executor (Neon serverless). */
export const sql = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => getSql()(strings, ...values)) as NeonQueryFunction<false, false>;
