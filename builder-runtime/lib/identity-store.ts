import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

/**
 * Builder-only identity store. This is intentionally a local durable file
 * store: no reputation users, plans, database tables or provider accounts are
 * read. The stable subject ID is the contract future generation quotas and
 * usage reservations must use.
 */
export const BUILDER_IDENTITY_STORE_VERSION = 1 as const;
export const BUILDER_IDENTITY_STORE_FILE = "identity-store.json";
const LOCK_FILE = "identity-store.lock";
const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 25;
const STALE_LOCK_MS = 30_000;
const TOKEN_BYTES = 32;

export type BuilderSubjectRecord = {
  id: string;
  label: string;
  createdAt: string;
  /** A revoked subject cannot redeem or use any session. */
  revokedAt?: string;
};

export type BuilderInviteRecord = {
  id: string;
  subjectId: string;
  label: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  redeemedSessionId?: string;
};

export type BuilderSessionRecord = {
  id: string;
  subjectId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

/**
 * Builder-only generation ledger. `costMicros` is the effective spend for a
 * final record; `reservedCostMicros` preserves the original reservation for
 * audit. Older records without the optional fields remain readable.
 */
export type BuilderUsageRecord = {
  id: string;
  subjectId: string;
  sessionId: string;
  generationId: string;
  recordedAt: string;
  state: "reserved" | "succeeded" | "failed" | "unknown";
  costMicros: number | null;
  /** Client-supplied idempotency key, scoped to subject/session. */
  requestKey?: string;
  reservedCostMicros?: number;
  leaseExpiresAt?: string;
  settledAt?: string;
  settlementReason?: string;
  reconciledAt?: string;
};

export type BuilderIdentityStore = {
  version: typeof BUILDER_IDENTITY_STORE_VERSION;
  subjects: BuilderSubjectRecord[];
  invites: BuilderInviteRecord[];
  sessions: BuilderSessionRecord[];
  usage: BuilderUsageRecord[];
};

export class BuilderStoreUnavailable extends Error {
  constructor(message = "Builder identity storage is unavailable.") {
    super(message);
    this.name = "BuilderStoreUnavailable";
  }
}

export type BuilderInviteRedemptionCode =
  | "invalid"
  | "used"
  | "expired"
  | "revoked"
  | "subject_revoked";

export class BuilderInviteRedemptionError extends Error {
  readonly code: BuilderInviteRedemptionCode;

  constructor(code: BuilderInviteRedemptionCode) {
    super("This invitation cannot be used.");
    this.name = "BuilderInviteRedemptionError";
    this.code = code;
  }
}

export type IssuedBuilderInvite = {
  invite: BuilderInviteRecord;
  subject: BuilderSubjectRecord;
  /** Returned once to the operator. Only its SHA-256 hash is stored. */
  token: string;
};

export type RedeemedBuilderSession = {
  session: BuilderSessionRecord;
  subject: BuilderSubjectRecord;
  /** Returned once for the HTTP-only cookie. Only its hash is stored. */
  token: string;
};

export type ActiveBuilderSession = {
  session: BuilderSessionRecord;
  subject: BuilderSubjectRecord;
};

function nowIso(now: Date): string {
  return now.toISOString();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function newId(prefix: "sub" | "inv" | "ses" | "use"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function emptyStore(): BuilderIdentityStore {
  return {
    version: BUILDER_IDENTITY_STORE_VERSION,
    subjects: [],
    invites: [],
    sessions: [],
    usage: [],
  };
}

function storePath(storeDir: string): string {
  return path.join(path.resolve(storeDir), BUILDER_IDENTITY_STORE_FILE);
}

function validStore(value: unknown): value is BuilderIdentityStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === BUILDER_IDENTITY_STORE_VERSION &&
    Array.isArray(record.subjects) &&
    Array.isArray(record.invites) &&
    Array.isArray(record.sessions) &&
    Array.isArray(record.usage)
  );
}

async function readStoreUnlocked(storeDir: string): Promise<BuilderIdentityStore> {
  const file = storePath(storeDir);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new BuilderStoreUnavailable();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!validStore(parsed)) throw new Error("unsupported store shape");
    return parsed;
  } catch {
    throw new BuilderStoreUnavailable(
      "Builder identity storage is corrupt or has an unsupported version.",
    );
  }
}

async function writeStoreUnlocked(
  storeDir: string,
  store: BuilderIdentityStore,
): Promise<void> {
  const directory = path.resolve(storeDir);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${BUILDER_IDENTITY_STORE_FILE}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, storePath(directory));
  } catch {
    await rm(temporary, { force: true });
    throw new BuilderStoreUnavailable();
  }
}

async function clearIfStale(lockPath: string): Promise<void> {
  try {
    const details = await stat(lockPath);
    if (Date.now() - details.mtimeMs > STALE_LOCK_MS) {
      await rm(lockPath, { force: true });
    }
  } catch {
    // Another process may have released it already.
  }
}

async function withStoreLock<T>(
  storeDir: string,
  operation: (store: BuilderIdentityStore) => Promise<T> | T,
): Promise<T> {
  const directory = path.resolve(storeDir);
  try {
    await mkdir(directory, { recursive: true });
  } catch {
    throw new BuilderStoreUnavailable();
  }
  const lockPath = path.join(directory, LOCK_FILE);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  while (!handle) {
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new BuilderStoreUnavailable();
      }
      await clearIfStale(lockPath);
      if (Date.now() >= deadline) throw new BuilderStoreUnavailable();
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      "utf8",
    );
    const store = await readStoreUnlocked(directory);
    const result = await operation(store);
    await writeStoreUnlocked(directory, store);
    return result;
  } finally {
    try {
      await handle.close();
    } catch {
      // The lock is still removed below.
    }
    await rm(lockPath, { force: true });
  }
}

export async function readBuilderIdentityStore(
  storeDir: string,
): Promise<BuilderIdentityStore> {
  return readStoreUnlocked(storeDir);
}

/**
 * Serialized read/write transaction over the builder-only store. Identity and
 * usage records share one lock so quota checks and reservations are atomic.
 */
export async function withBuilderIdentityStore<T>(
  storeDir: string,
  operation: (store: BuilderIdentityStore) => Promise<T> | T,
): Promise<T> {
  return withStoreLock(storeDir, operation);
}

export async function issueBuilderInvite(input: {
  storeDir: string;
  label: string;
  inviteTtlSeconds: number;
  subjectId?: string;
  subjectLabel?: string;
  now?: Date;
}): Promise<IssuedBuilderInvite> {
  const label = input.label.trim().slice(0, 120);
  if (!label) throw new Error("Invitation label is required.");
  if (!Number.isFinite(input.inviteTtlSeconds) || input.inviteTtlSeconds <= 0) {
    throw new Error("Invitation expiry must be a positive number of seconds.");
  }
  const now = input.now ?? new Date();

  return withStoreLock(input.storeDir, (store) => {
    let subject: BuilderSubjectRecord | undefined;
    if (input.subjectId) {
      subject = store.subjects.find((item) => item.id === input.subjectId);
      if (!subject) throw new Error("Subject does not exist.");
      if (subject.revokedAt) throw new Error("Subject is revoked.");
    } else {
      subject = {
        id: newId("sub"),
        label: (input.subjectLabel?.trim() || label).slice(0, 120),
        createdAt: nowIso(now),
      };
      store.subjects.push(subject);
    }

    const token = newToken();
    const invite: BuilderInviteRecord = {
      id: newId("inv"),
      subjectId: subject.id,
      label,
      tokenHash: tokenHash(token),
      createdAt: nowIso(now),
      expiresAt: new Date(
        now.getTime() + input.inviteTtlSeconds * 1000,
      ).toISOString(),
    };
    store.invites.push(invite);
    return { invite, subject, token };
  });
}

export async function redeemBuilderInvite(input: {
  storeDir: string;
  token: string;
  sessionTtlSeconds: number;
  now?: Date;
}): Promise<RedeemedBuilderSession> {
  const token = input.token.trim();
  if (!token || token.length > 512) {
    throw new BuilderInviteRedemptionError("invalid");
  }
  if (!Number.isFinite(input.sessionTtlSeconds) || input.sessionTtlSeconds <= 0) {
    throw new BuilderStoreUnavailable("Builder session expiry is invalid.");
  }
  const now = input.now ?? new Date();
  const digest = tokenHash(token);

  return withStoreLock(input.storeDir, (store) => {
    const invite = store.invites.find((item) => item.tokenHash === digest);
    if (!invite) throw new BuilderInviteRedemptionError("invalid");
    if (invite.revokedAt) throw new BuilderInviteRedemptionError("revoked");
    if (invite.usedAt) throw new BuilderInviteRedemptionError("used");
    if (Date.parse(invite.expiresAt) <= now.getTime()) {
      throw new BuilderInviteRedemptionError("expired");
    }

    const subject = store.subjects.find(
      (item) => item.id === invite.subjectId,
    );
    if (!subject || subject.revokedAt) {
      throw new BuilderInviteRedemptionError("subject_revoked");
    }

    const sessionToken = newToken();
    const session: BuilderSessionRecord = {
      id: newId("ses"),
      subjectId: subject.id,
      tokenHash: tokenHash(sessionToken),
      createdAt: nowIso(now),
      expiresAt: new Date(
        now.getTime() + input.sessionTtlSeconds * 1000,
      ).toISOString(),
    };
    invite.usedAt = nowIso(now);
    invite.redeemedSessionId = session.id;
    store.sessions.push(session);
    return { session, subject, token: sessionToken };
  });
}

export async function validateBuilderSession(input: {
  storeDir: string;
  token: string;
  now?: Date;
}): Promise<ActiveBuilderSession | null> {
  const token = input.token.trim();
  if (!token || token.length > 512) return null;
  const now = input.now ?? new Date();
  const digest = tokenHash(token);
  const store = await readStoreUnlocked(input.storeDir);
  const session = store.sessions.find((item) => item.tokenHash === digest);
  if (!session || session.revokedAt) return null;
  if (Date.parse(session.expiresAt) <= now.getTime()) return null;
  const subject = store.subjects.find((item) => item.id === session.subjectId);
  if (!subject || subject.revokedAt) return null;
  return { session, subject };
}

export async function revokeBuilderSession(input: {
  storeDir: string;
  sessionId?: string;
  token?: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const digest = input.token ? tokenHash(input.token.trim()) : null;
  return withStoreLock(input.storeDir, (store) => {
    const session = store.sessions.find(
      (item) =>
        (input.sessionId && item.id === input.sessionId) ||
        (digest && item.tokenHash === digest),
    );
    if (!session || session.revokedAt) return false;
    session.revokedAt = nowIso(now);
    return true;
  });
}

export async function revokeBuilderInvite(input: {
  storeDir: string;
  inviteId?: string;
  token?: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const digest = input.token ? tokenHash(input.token.trim()) : null;
  return withStoreLock(input.storeDir, (store) => {
    const invite = store.invites.find(
      (item) =>
        (input.inviteId && item.id === input.inviteId) ||
        (digest && item.tokenHash === digest),
    );
    if (!invite || invite.revokedAt) return false;
    invite.revokedAt = nowIso(now);
    return true;
  });
}

export async function revokeBuilderSubject(input: {
  storeDir: string;
  subjectId: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  return withStoreLock(input.storeDir, (store) => {
    const subject = store.subjects.find((item) => item.id === input.subjectId);
    if (!subject) return false;
    if (!subject.revokedAt) subject.revokedAt = nowIso(now);
    for (const invite of store.invites) {
      if (invite.subjectId === subject.id && !invite.revokedAt) {
        invite.revokedAt = nowIso(now);
      }
    }
    for (const session of store.sessions) {
      if (session.subjectId === subject.id && !session.revokedAt) {
        session.revokedAt = nowIso(now);
      }
    }
    return true;
  });
}

export async function builderStoreIsWritable(storeDir: string): Promise<boolean> {
  try {
    await withStoreLock(storeDir, () => undefined);
    return true;
  } catch {
    return false;
  }
}
