import { createHash } from "node:crypto";
import { withDatabaseDeadline } from "./db/deadline.ts";

export const PRIVATE_PREVIEW_DB_IDENTITY_TIMEOUT_MS = 4_000;

export type PrivatePreviewDbIdentityStatus =
  | "verified"
  | "not_private_preview"
  | "unauthorized"
  | "configuration_invalid"
  | "identity_mismatch"
  | "verification_failed";

export type PrivatePreviewDbIdentityPreflightStatus = "ready"
  | "not_private_preview"
  | "configuration_invalid"
  | "identity_mismatch";

export type PrivatePreviewDbIdentityEnvironment = Record<string, string | undefined>;

export type PrivatePreviewDbIdentity = {
  databaseName: unknown;
  roleName: unknown;
};

type Dependencies = {
  env: PrivatePreviewDbIdentityEnvironment;
  privatePreview: boolean;
  authenticate: () => Promise<boolean>;
  queryIdentity: () => Promise<PrivatePreviewDbIdentity>;
  timeoutMs?: number;
};

type ExpectedIdentity = {
  endpointSha256: string;
  databaseName: string;
  roleName: string;
};

function expectedIdentity(env: PrivatePreviewDbIdentityEnvironment): ExpectedIdentity | null {
  const databaseUrl = env.DATABASE_URL;
  const endpointSha256 = env.ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256;
  const databaseName = env.ORNIGAMI_PREVIEW_DB_EXPECTED_NAME;
  const roleName = env.ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE;
  if (!databaseUrl || !endpointSha256 || !databaseName || !roleName) return null;
  if (!/^[a-f\d]{64}$/i.test(endpointSha256)) return null;
  const validIdentifier = /^[A-Za-z_][A-Za-z\d_$-]{0,62}$/;
  if (!validIdentifier.test(databaseName) || !validIdentifier.test(roleName)) return null;

  try {
    const url = new URL(databaseUrl);
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname || !url.username || !url.password) return null;
    return {
      endpointSha256: endpointSha256.toLowerCase(),
      databaseName,
      roleName,
    };
  } catch {
    return null;
  }
}

function endpointSha256(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    if (!url.hostname) return null;
    const port = url.port || "5432";
    return createHash("sha256").update(`${url.hostname.toLowerCase()}:${port}`, "utf8").digest("hex");
  } catch {
    return null;
  }
}

/** Pure configuration and environment gate. It must remain free of auth and I/O. */
export function preflightPrivatePreviewDatabaseIdentity(
  env: PrivatePreviewDbIdentityEnvironment,
  privatePreview: boolean,
): PrivatePreviewDbIdentityPreflightStatus {
  if (!privatePreview) return "not_private_preview";
  const expected = expectedIdentity(env);
  if (!expected) return "configuration_invalid";
  const configuredEndpointHash = endpointSha256(env.DATABASE_URL!);
  if (!configuredEndpointHash) return "configuration_invalid";
  if (configuredEndpointHash !== expected.endpointSha256) return "identity_mismatch";
  return "ready";
}

/** Apply the same short deadline to the read performed by the route. */
export function withPrivatePreviewDatabaseIdentityDeadline<T>(query: () => Promise<T>): Promise<T> {
  return withDatabaseDeadline(Date.now() + PRIVATE_PREVIEW_DB_IDENTITY_TIMEOUT_MS, query);
}

export function privatePreviewDatabaseIdentityHttpResponse(status: PrivatePreviewDbIdentityStatus) {
  const httpStatus: Record<PrivatePreviewDbIdentityStatus, number> = {
    verified: 200,
    not_private_preview: 404,
    unauthorized: 401,
    configuration_invalid: 503,
    identity_mismatch: 503,
    verification_failed: 503,
  };
  return {
    status: httpStatus[status],
    body: { status },
    headers: { "Cache-Control": "no-store, max-age=0" },
  } as const;
}

export async function runPrivatePreviewDatabaseIdentityRoute(dependencies: Dependencies) {
  const status = await checkPrivatePreviewDatabaseIdentity(dependencies);
  return privatePreviewDatabaseIdentityHttpResponse(status);
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("identity_check_timeout")), timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Fail-closed orchestration for the private Preview identity check.
 * Only fixed statuses escape; dependency errors and connection metadata do not.
 */
export async function checkPrivatePreviewDatabaseIdentity({
  env,
  privatePreview,
  authenticate,
  queryIdentity,
  timeoutMs = PRIVATE_PREVIEW_DB_IDENTITY_TIMEOUT_MS,
}: Dependencies): Promise<PrivatePreviewDbIdentityStatus> {
  const preflightStatus = preflightPrivatePreviewDatabaseIdentity(env, privatePreview);
  if (preflightStatus !== "ready") return preflightStatus;
  const expected = expectedIdentity(env);
  if (!expected) return "configuration_invalid";

  let authenticated: boolean;
  try {
    authenticated = await authenticate();
  } catch {
    return "verification_failed";
  }
  if (!authenticated) return "unauthorized";

  try {
    const actual = await withTimeout(queryIdentity(), Math.min(
      PRIVATE_PREVIEW_DB_IDENTITY_TIMEOUT_MS,
      Math.max(1, Math.floor(timeoutMs)),
    ));
    const matches = actual.databaseName === expected.databaseName
      && actual.roleName === expected.roleName;
    return matches ? "verified" : "identity_mismatch";
  } catch {
    return "verification_failed";
  }
}
