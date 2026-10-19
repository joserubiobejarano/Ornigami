import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PROVISIONING_TARGET = Object.freeze({
  databaseName: "ornigami_staging",
  roleName: "ornigami_staging_owner",
  userId: "6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001",
  businessId: "6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002",
});

export const PREFLIGHT_DEADLINES = Object.freeze({ statementTimeoutMs: 4_000, requestTimeoutMs: 5_000 });

export const PREFLIGHT_CHECK_KEYS = Object.freeze([
  "databaseMatch",
  "roleMatch",
  "userMatch",
  "profileMatch",
  "businessMatch",
  "membershipMatch",
  "reviewMatch",
  "businessCountMatch",
  "membershipCountMatch",
  "reviewCountMatch",
]);

const EXPECTED_ENV = Object.freeze({
  endpointFingerprint: "ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256",
  databaseName: "ORNIGAMI_PREVIEW_DB_EXPECTED_NAME",
  roleName: "ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE",
});

function validFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function endpointFingerprint(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) return null;
    const port = parsed.port || "5432";
    return createHash("sha256")
      .update(`${parsed.hostname.toLowerCase()}:${port}`, "utf8")
      .digest("hex");
  } catch {
    return null;
  }
}

function approvedConfiguration(env, approvedEndpointFingerprint) {
  const databaseUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : "";
  const actualFingerprint = endpointFingerprint(databaseUrl);
  const configuredFingerprint = env[EXPECTED_ENV.endpointFingerprint];
  const expectedDatabaseName = env[EXPECTED_ENV.databaseName];
  const expectedRoleName = env[EXPECTED_ENV.roleName];
  if (!actualFingerprint || !validFingerprint(configuredFingerprint)
    || !validFingerprint(approvedEndpointFingerprint)
    || configuredFingerprint !== approvedEndpointFingerprint
    || expectedDatabaseName !== PROVISIONING_TARGET.databaseName
    || expectedRoleName !== PROVISIONING_TARGET.roleName) {
    return { status: "configuration_invalid" };
  }
  if (actualFingerprint !== configuredFingerprint) return { status: "endpoint_mismatch" };
  return { status: "ready", databaseUrl };
}

function sanitizedChecks(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(PREFLIGHT_CHECK_KEYS.map((key) => [key, source[key] === true]));
}

function resultForChecks(checks) {
  return {
    status: Object.values(checks).every(Boolean) ? "verified" : "identity_mismatch",
    checks,
  };
}

/**
 * Runs only when explicitly called by the CLI after the endpoint/target guards.
 * Importing this module never loads a database client or opens a connection.
 */
export async function executeReadOnlyProbe({ databaseUrl }, { createClient } = {}) {
  const clientFactory = createClient ?? (async (url) => {
    const { neon } = await import("@neondatabase/serverless");
    return neon(url);
  });
  const sql = await clientFactory(databaseUrl);
  const signal = AbortSignal.timeout(PREFLIGHT_DEADLINES.requestTimeoutMs);
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('statement_timeout', ${`${PREFLIGHT_DEADLINES.statementTimeoutMs}ms`}, true)`,
    tx`SELECT
      current_database() = 'ornigami_staging' AS "databaseMatch",
      current_user = 'ornigami_staging_owner' AS "roleMatch",
      (SELECT count(*) = 1 FROM public.users
        WHERE id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
          AND email = 'preview.owner@ornigami.example.test') AS "userMatch",
      (SELECT count(*) = 1 FROM public.profiles
        WHERE id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
          AND business_name = 'Example Studio 001') AS "profileMatch",
      (SELECT count(*) = 1 FROM public.businesses
        WHERE id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
          AND owner_user_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
          AND name = 'Example Studio 001'
          AND stripe_customer_id IS NULL AND google_review_url IS NULL
          AND rebooking_url IS NULL AND email_from_name IS NULL) AS "businessMatch",
      (SELECT count(*) = 1 FROM public.business_members
        WHERE business_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
          AND user_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
          AND role = 'owner') AS "membershipMatch",
      (SELECT count(*) = 1 FROM public.reviews
        WHERE user_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'
          AND business_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002'
          AND google_review_id = 'synthetic-review-0001') AS "reviewMatch",
      (SELECT count(*) = 1 FROM public.businesses
        WHERE owner_user_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001') AS "businessCountMatch",
      (SELECT count(*) = 1 FROM public.business_members
        WHERE user_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001') AS "membershipCountMatch",
      (SELECT count(*) = 1 FROM public.reviews
        WHERE user_id = '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001') AS "reviewCountMatch"`,
  ], {
    readOnly: true,
    fetchOptions: { signal },
  });
  return results?.[1]?.[0] ?? null;
}

/**
 * Offline-testable orchestration. The approved fingerprint must be supplied
 * separately from environment configuration; the injected probe is not called
 * unless both match the parsed DATABASE_URL endpoint fingerprint.
 */
export async function runProvisioningPreflight({
  env = process.env,
  approvedEndpointFingerprint,
  probe = executeReadOnlyProbe,
} = {}) {
  const configuration = approvedConfiguration(env, approvedEndpointFingerprint);
  if (configuration.status !== "ready") return { status: configuration.status };
  try {
    const checks = sanitizedChecks(await probe({
      databaseUrl: configuration.databaseUrl,
      expectedDatabaseName: PROVISIONING_TARGET.databaseName,
      expectedRoleName: PROVISIONING_TARGET.roleName,
      readOnly: true,
      ...PREFLIGHT_DEADLINES,
    }));
    return resultForChecks(checks);
  } catch {
    return { status: "verification_failed" };
  }
}

function approvedFingerprintArgument(args) {
  const index = args.indexOf("--approved-endpoint-fingerprint");
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const result = await runProvisioningPreflight({
    approvedEndpointFingerprint: approvedFingerprintArgument(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "verified" ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write('{"status":"verification_failed"}\n');
    process.exitCode = 1;
  });
}
