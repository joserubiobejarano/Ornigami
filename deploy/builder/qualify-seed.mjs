#!/usr/bin/env node
/**
 * Qualification-only store fixture. It is mounted read-only into a one-shot
 * container and uses the packaged runtime's own identity/usage modules.
 *
 * It never runs in the web runtime and is not copied into the image.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { reserveBuilderUsage } from "../builder-runtime/lib/usage-ledger.ts";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

function fail(message) {
  console.error(`QUALIFY SEED FAIL: ${message}`);
  process.exit(1);
}

const [command] = process.argv.slice(2);
const store = option("--store") ?? process.env.BUILDER_RUNTIME_STORE_DIR;
if (!store) fail("--store or BUILDER_RUNTIME_STORE_DIR is required");

if (command === "reserve") {
  const subjectId = option("--subject");
  const sessionId = option("--session");
  if (!subjectId || !sessionId) fail("--subject and --session are required");
  const leaseSeconds = Number.parseInt(option("--lease-seconds") ?? "3600", 10);
  const result = await reserveBuilderUsage({
    storeDir: store,
    subjectId,
    sessionId,
    requestKey: option("--request-key") ?? randomUUID(),
    limits: {
      windowSeconds: 3600,
      reservationLeaseSeconds: leaseSeconds,
      requestReserveMicros: Number.parseInt(
        option("--reserve-micros") ?? "50000",
        10,
      ),
      subjectRequests: 100,
      globalRequests: 1_000,
      subjectConcurrency: 1,
      globalConcurrency: 10,
      subjectSpendMicros: 10_000_000,
      globalSpendMicros: 20_000_000,
    },
  });
  if (!result.ok) {
    fail(
      `reservation was denied: ${result.code}${result.existing ? ` (existing ${result.existing.id})` : ""}`,
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      id: result.record.id,
      state: result.record.state,
      costMicros: result.record.costMicros,
      reservedCostMicros: result.record.reservedCostMicros,
      leaseExpiresAt: result.record.leaseExpiresAt,
      requestKey: result.record.requestKey,
    }),
  );
} else if (command === "stale-lock") {
  const token = option("--token") ?? `qualify-${randomUUID()}`;
  const hostname =
    option("--hostname") ??
    process.env.BUILDER_RUNTIME_STORE_HOST_ID ??
    "replaced-builder-container";
  const scope = option("--scope") ?? "replaced-container-pid-namespace";
  const pid = Number.parseInt(option("--pid") ?? "2147483647", 10);
  await mkdir(store, { recursive: true });
  await writeFile(
    path.join(store, "identity-store.lock"),
    `${JSON.stringify({
      version: 1,
      token,
      pid,
      hostname,
      scope,
      acquiredAt: "2020-01-01T00:00:00.000Z",
    })}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ ok: true, token, hostname, scope, pid }));
} else {
  fail(`unknown command: ${command}`);
}
