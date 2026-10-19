import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  createOneShotProvisioningLauncher,
} from "./staging-provisioning-launcher.mjs";
import {
  PREFLIGHT_DEADLINES,
  PROVISIONING_TARGET,
  runProvisioningPreflight,
} from "./staging-provisioning-preflight.mjs";

const EXPECTED_ENV = Object.freeze({
  endpointFingerprint: "ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256",
  databaseName: "ORNIGAMI_PREVIEW_DB_EXPECTED_NAME",
  roleName: "ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE",
});

export const FIXTURE_PROVISIONING_STATUSES = Object.freeze([
  "execution_not_authorized",
  "delivery_plan_required",
  "credential_hash_invalid",
  "configuration_invalid",
  "endpoint_mismatch",
  "verification_failed",
  "cli_unavailable",
  "already_attempted",
  "cli_timeout",
  "output_too_large",
  "cli_failed",
  "credential_response_invalid",
  "target_mismatch",
  "identity_mismatch",
  "credential_state_not_ready",
  "concurrent_state_change",
  "write_outcome_uncertain",
  "credential_write_applied",
]);

export const FIXTURE_STATE_CHECK_KEYS = Object.freeze([
  "identityMatch",
  "passwordHashAbsent",
  "emailUnverified",
  "deletionClear",
  "authVersionExpected",
  "noVerificationToken",
  "noResetToken",
]);

const ALL_READY_CHECKS = Object.freeze(Object.fromEntries(FIXTURE_STATE_CHECK_KEYS.map((key) => [key, true])));

function fixedResult(status, checks) {
  const result = { status: FIXTURE_PROVISIONING_STATUSES.includes(status) ? status : "write_outcome_uncertain" };
  if (checks) result.checks = Object.fromEntries(FIXTURE_STATE_CHECK_KEYS.map((key) => [key, checks[key] === true]));
  return result;
}

function sanitizeProvisioningResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fixedResult("write_outcome_uncertain");
  if (value.status === "credential_state_not_ready" || value.status === "concurrent_state_change"
    || value.status === "credential_write_applied") return fixedResult(value.status, value.checks);
  return fixedResult(value.status);
}

export function isBcryptCost10Hash(value) {
  return typeof value === "string" && /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/.test(value);
}

function readyState(rows) {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  return Object.fromEntries(FIXTURE_STATE_CHECK_KEYS.map((key) => [key, row?.[key] === true]));
}

function stateQuery(tx) {
  return tx`SELECT
    (u.email = 'preview.owner@ornigami.example.test') AS "identityMatch",
    (u.password_hash IS NULL) AS "passwordHashAbsent",
    (u.email_verified IS NULL) AS "emailUnverified",
    (u.privacy_deletion_requested_at IS NULL) AS "deletionClear",
    (u.auth_version = 0) AS "authVersionExpected",
    NOT EXISTS (SELECT 1 FROM public.email_verification_tokens t WHERE t.user_id = u.id) AS "noVerificationToken",
    NOT EXISTS (SELECT 1 FROM public.password_reset_tokens t WHERE t.user_id = u.id) AS "noResetToken"
    FROM public.users u
    WHERE u.id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'`;
}

const GUARDED_UPDATE = `UPDATE public.users AS u
SET password_hash = $1,
    email_verified = now(),
    updated_at = now(),
    auth_version = u.auth_version + 1
WHERE u.id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
  AND u.email = 'preview.owner@ornigami.example.test'
  AND u.password_hash IS NULL
  AND u.email_verified IS NULL
  AND u.privacy_deletion_requested_at IS NULL
  AND u.auth_version = 0
  AND NOT EXISTS (SELECT 1 FROM public.email_verification_tokens t WHERE t.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.password_reset_tokens t WHERE t.user_id = u.id)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.business_name = 'Example Studio 001')
  AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
    AND b.owner_user_id = u.id AND b.name = 'Example Studio 001' AND b.stripe_customer_id IS NULL
    AND b.google_review_url IS NULL AND b.rebooking_url IS NULL AND b.email_from_name IS NULL)
  AND EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
    AND m.user_id = u.id AND m.role = 'owner')
  AND EXISTS (SELECT 1 FROM public.reviews r WHERE r.user_id = u.id
    AND r.business_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
    AND r.google_review_id = 'synthetic-review-0001')
RETURNING true AS "updated"`;

function endpointConfigurationMatches(env, approvedEndpointFingerprint, endpointForm) {
  return env?.[EXPECTED_ENV.endpointFingerprint] === approvedEndpointFingerprint
    && env?.[EXPECTED_ENV.databaseName] === PROVISIONING_TARGET.databaseName
    && env?.[EXPECTED_ENV.roleName] === PROVISIONING_TARGET.roleName
    && ["direct", "pooled"].includes(endpointForm);
}

function endpointFingerprint(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) return null;
    return createHash("sha256")
      .update(`${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}`, "utf8")
      .digest("hex");
  } catch {
    return null;
  }
}

function databaseTargetMatches(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return ["postgres:", "postgresql:"].includes(parsed.protocol)
      && decodeURIComponent(parsed.username) === PROVISIONING_TARGET.roleName
      && decodeURIComponent(parsed.pathname.slice(1)) === PROVISIONING_TARGET.databaseName
      && Boolean(parsed.hostname && parsed.password)
      && !parsed.hash;
  } catch {
    return false;
  }
}

/**
 * Performs a bounded readiness read followed by one guarded transaction.
 * Calling/importing this function is inert until explicitly invoked.
 */
export async function inspectAndProvisionExistingFixture({
  databaseUrl,
  approvedEndpointFingerprint,
  endpointForm,
  passwordHash,
  executionAuthorized,
  deliveryPlanApproved,
  env = process.env,
  createClient,
} = {}) {
  if (executionAuthorized !== true) return fixedResult("execution_not_authorized");
  if (deliveryPlanApproved !== true) return fixedResult("delivery_plan_required");
  if (!endpointConfigurationMatches(env, approvedEndpointFingerprint, endpointForm)) {
    return fixedResult("configuration_invalid");
  }
  if (!databaseTargetMatches(databaseUrl)) return fixedResult("target_mismatch");
  if (endpointFingerprint(databaseUrl) !== approvedEndpointFingerprint) return fixedResult("endpoint_mismatch");
  if (!isBcryptCost10Hash(passwordHash)) return fixedResult("credential_hash_invalid");

  let hash = passwordHash;
  let sql;
  let checks;
  try {
    const clientFactory = createClient ?? (async (url) => {
      const { neon } = await import("@neondatabase/serverless");
      return neon(url);
    });
    sql = await clientFactory(databaseUrl);
    const signal = () => AbortSignal.timeout(PREFLIGHT_DEADLINES.requestTimeoutMs);
    const stateResults = await sql.transaction((tx) => [stateQuery(tx)], {
      readOnly: true,
      fetchOptions: { signal: signal() },
    });
    checks = readyState(stateResults?.[0]);
  } catch {
    return fixedResult("verification_failed");
  }
  if (!Object.values(checks).every(Boolean)) return fixedResult("credential_state_not_ready", checks);

  try {
    const signal = () => AbortSignal.timeout(PREFLIGHT_DEADLINES.requestTimeoutMs);
    const writeResults = await sql.transaction((tx) => [
      tx`SELECT set_config('statement_timeout', ${`${PREFLIGHT_DEADLINES.statementTimeoutMs}ms`}, true)`,
      tx`SELECT pg_advisory_xact_lock(hashtextextended('billing-customer:6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001', 0))`,
      tx`SELECT pg_advisory_xact_lock(hashtextextended('billing-checkout-owner:6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001', 0))`,
      tx.query(GUARDED_UPDATE, [hash]),
    ], {
      readOnly: false,
      fetchOptions: { signal: signal() },
    });
    const updatedRows = writeResults?.[3];
    if (Array.isArray(updatedRows) && updatedRows.length === 1 && updatedRows[0]?.updated === true) {
      return fixedResult("credential_write_applied", ALL_READY_CHECKS);
    }
    if (Array.isArray(updatedRows) && updatedRows.length === 0) {
      return fixedResult("concurrent_state_change", ALL_READY_CHECKS);
    }
    return fixedResult("write_outcome_uncertain");
  } catch {
    // A transport failure can happen after the server commits; never retry here.
    return fixedResult("write_outcome_uncertain");
  } finally {
    hash = "";
  }
}

/**
 * Explicit one-shot orchestration. No generated password or delivery is included;
 * an approved external process supplies only the bcrypt hash in memory.
 */
export function createOneShotFixtureCredentialProvisioner({
  createLauncher = createOneShotProvisioningLauncher,
  runIdentityPreflight = runProvisioningPreflight,
  provision = inspectAndProvisionExistingFixture,
  ...launcherOptions
} = {}) {
  let attempted = false;
  let activeHash = "";
  const launch = createLauncher({
    ...launcherOptions,
    sanitizeResult: sanitizeProvisioningResult,
    runPreflight: async ({ env, approvedEndpointFingerprint, endpointForm }) => {
      const identity = await runIdentityPreflight({ env, approvedEndpointFingerprint });
      if (identity?.status !== "verified") return identity;
      return provision({
        databaseUrl: env?.DATABASE_URL,
        approvedEndpointFingerprint,
        endpointForm,
        passwordHash: activeHash,
        executionAuthorized: true,
        deliveryPlanApproved: true,
        env,
      });
    },
  });

  return async function provisionOnce({
    approvedEndpointFingerprint,
    endpointForm,
    passwordHash,
    deliveryPlanApproved,
    executionAuthorized,
    env = process.env,
  } = {}) {
    if (attempted) return fixedResult("already_attempted");
    attempted = true;
    if (executionAuthorized !== true) return fixedResult("execution_not_authorized");
    if (deliveryPlanApproved !== true) return fixedResult("delivery_plan_required");
    if (!endpointConfigurationMatches(env, approvedEndpointFingerprint, endpointForm)) {
      return fixedResult("configuration_invalid");
    }
    if (!isBcryptCost10Hash(passwordHash)) return fixedResult("credential_hash_invalid");
    activeHash = passwordHash;
    try {
      return await launch({ approvedEndpointFingerprint, endpointForm, env });
    } finally {
      activeHash = "";
    }
  };
}

async function readHashFromStdin({ timeoutMs = 5_000, maxBytes = 128 } = {}) {
  const chunks = [];
  let size = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const clearChunks = () => {
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
    };
    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("error", onError);
      process.stdin.removeListener("end", onEnd);
    };
    const fail = (reason) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearChunks();
      process.stdin.pause();
      reject(new Error(reason));
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        fail("input_too_large");
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    const onError = () => fail("input_failed");
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const input = Buffer.concat(chunks);
      clearChunks();
      resolve(input);
    };
    const timer = setTimeout(() => fail("input_timeout"), timeoutMs);
    process.stdin.on("data", onData);
    process.stdin.once("error", onError);
    process.stdin.once("end", onEnd);
    process.stdin.resume();
  });
}

function argPresent(args, name) {
  return args.includes(name);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const approvedEndpointFingerprint = argValue(args, "--approved-endpoint-fingerprint");
  const endpointForm = argValue(args, "--endpoint-form");
  if (!argPresent(args, "--execute-existing-fixture-write")) {
    process.stdout.write('{"status":"execution_not_authorized"}\n');
    process.exitCode = 1;
    return;
  }
  if (!argPresent(args, "--delivery-plan-approved")) {
    process.stdout.write('{"status":"delivery_plan_required"}\n');
    process.exitCode = 1;
    return;
  }
  if (!endpointConfigurationMatches(process.env, approvedEndpointFingerprint, endpointForm)) {
    process.stdout.write('{"status":"configuration_invalid"}\n');
    process.exitCode = 1;
    return;
  }
  if (process.stdin.isTTY) {
    process.stdout.write('{"status":"credential_hash_invalid"}\n');
    process.exitCode = 1;
    return;
  }
  let hashBuffer;
  let hash = "";
  try {
    hashBuffer = await readHashFromStdin();
    hash = hashBuffer.toString("utf8").trim();
    hashBuffer.fill(0);
    const provisionOnce = createOneShotFixtureCredentialProvisioner();
    const result = await provisionOnce({
      approvedEndpointFingerprint: argValue(args, "--approved-endpoint-fingerprint"),
      endpointForm,
      passwordHash: hash,
      deliveryPlanApproved: true,
      executionAuthorized: true,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "credential_write_applied" ? 0 : 1;
  } catch {
    process.stdout.write('{"status":"credential_hash_invalid"}\n');
    process.exitCode = 1;
  } finally {
    if (hashBuffer) hashBuffer.fill(0);
    hash = "";
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write('{"status":"write_outcome_uncertain"}\n');
    process.exitCode = 1;
  });
}
