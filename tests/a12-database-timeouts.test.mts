import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

type SqlHarness = {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
  withDatabaseDeadline<T>(deadline: Date | number, callback: () => T): T;
  captured: Array<{ queries: Array<{ text: string; values: unknown[] }>; signal?: AbortSignal }>;
  setMode(mode: "rows" | "block"): void;
};

function makeHarness(): SqlHarness {
  const captured: SqlHarness["captured"] = [];
  let mode: "rows" | "block" = "rows";
  const format = (strings: TemplateStringsArray, values: unknown[]) => ({
    text: strings.reduce((all, part, index) => all + part + (index < values.length ? `$${index + 1}` : ""), ""), values,
  });
  const neonMock = () => Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => { void strings; void values; return Promise.resolve([]); },
    {
      transaction: async (makeQueries: (tag: (strings: TemplateStringsArray, ...values: unknown[]) => unknown) => unknown[], options?: { fetchOptions?: { signal?: AbortSignal } }) => {
        const queries = makeQueries((strings, ...values) => format(strings, values)) as Array<{ text: string; values: unknown[] }>;
        captured.push({ queries, signal: options?.fetchOptions?.signal });
        if (mode === "block") {
          return new Promise<unknown[][]>((_resolve, reject) => {
            const signal = options?.fetchOptions?.signal;
            if (!signal) return reject(new Error("missing request signal"));
            const abort = () => reject(new Error("request aborted"));
            if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
          });
        }
        return [[], [{ result: "row" }]];
      },
    },
  );
  const deadline = loadTs<{ withDatabaseDeadline: SqlHarness["withDatabaseDeadline"]; getDatabaseDeadline(): number | undefined }>("src/lib/db/deadline.ts");
  const neonModule = loadTs<{
    sql: SqlHarness["sql"];
  }>("src/lib/db/neon.ts", { overrides: {
    "@neondatabase/serverless": { neon: neonMock },
    "@/lib/env": { getRequiredEnv: () => "postgres://test.invalid/db" },
    "@/lib/db/deadline": deadline,
  } });
  return { ...neonModule, ...deadline, captured, setMode: (next) => { mode = next; } };
}

test("tagged SQL runs with transaction-local statement timeout, request abort, and row-array contract", async () => {
  const harness = makeHarness();
  const rows = await harness.withDatabaseDeadline(Date.now() + 4_000, () => harness.sql`SELECT ${7} AS result`);
  assert.deepEqual(rows, [{ result: "row" }]);
  const request = harness.captured[0];
  assert.match(request.queries[0].text, /set_config\('statement_timeout'/);
  assert.match(String(request.queries[0].values[0]), /^\d+ms$/);
  assert.equal(request.queries[1].values[0], 7);
  assert.ok(request.signal);
  assert.equal(request.signal?.aborted, false);
});

test("an expired inherited deadline rejects before making a database request", async () => {
  const harness = makeHarness();
  assert.throws(
    () => harness.withDatabaseDeadline(Date.now() - 1, () => harness.sql`SELECT 1`),
    /Database deadline exceeded/,
  );
  assert.equal(harness.captured.length, 0);
});

test("bounded blocked requests are aborted and deadline context does not leak after callback", async () => {
  const harness = makeHarness();
  harness.setMode("block");
  const keepAlive = setTimeout(() => {}, 2_000);
  try {
    await assert.rejects(
      () => harness.withDatabaseDeadline(Date.now() + 20, () => harness.sql`SELECT pg_sleep(30)`),
      /request aborted/,
    );
  } finally { clearTimeout(keepAlive); }
  assert.equal(harness.captured[0].signal?.aborted, true);
  harness.setMode("rows");
  await harness.sql`SELECT 1`;
  const defaultTimeout = Number.parseInt(String(harness.captured[1].queries[0].values[0]), 10);
  assert.ok(defaultTimeout > 9_000 && defaultTimeout <= 10_000, `expected default <= 10s, got ${defaultTimeout}ms`);
});
