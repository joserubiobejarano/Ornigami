import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getRequiredEnv } from "@/lib/env";
import { getDatabaseDeadline } from "@/lib/db/deadline";

export const DEFAULT_DATABASE_QUERY_TIMEOUT_MS = 10_000;

let sqlInstance: NeonQueryFunction<false, false> | undefined;

function getClient(): NeonQueryFunction<false, false> {
  if (!sqlInstance) {
    const url = getRequiredEnv("DATABASE_URL");
    sqlInstance = neon(url);
  }
  return sqlInstance;
}

/** Returns the deadline-aware tagged executor used by existing getSql() call sites. */
export function getSql(): NeonQueryFunction<false, false> {
  return sql;
}

function queryTimeouts(): { statementTimeoutMs: number; requestTimeoutMs: number } {
  const deadline = getDatabaseDeadline();
  if (deadline === undefined) return { statementTimeoutMs: DEFAULT_DATABASE_QUERY_TIMEOUT_MS, requestTimeoutMs: DEFAULT_DATABASE_QUERY_TIMEOUT_MS + 1_000 };
  const remainingMs = Math.floor(deadline - Date.now());
  if (remainingMs <= 0) throw new Error("Database deadline exceeded");
  const statementTimeoutMs = Math.min(DEFAULT_DATABASE_QUERY_TIMEOUT_MS, Math.max(1, remainingMs - 1_000));
  return { statementTimeoutMs, requestTimeoutMs: Math.min(remainingMs, statementTimeoutMs + 1_000) };
}

/** Tagged SQL executor with a transaction-local server timeout and bounded request signal. */
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  const { statementTimeoutMs, requestTimeoutMs } = queryTimeouts();
  const client = getClient();
  const signal = AbortSignal.timeout(requestTimeoutMs);
  return client.transaction((transactionSql) => [
    transactionSql`SELECT set_config('statement_timeout', ${`${statementTimeoutMs}ms`}, true)`,
    transactionSql(strings, ...values),
  ], { fetchOptions: { signal } }).then((results) => results[1]);
}) as NeonQueryFunction<false, false>;
