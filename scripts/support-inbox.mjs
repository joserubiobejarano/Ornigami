import { neon } from "@neondatabase/serverless";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const DEFAULT_INBOX_LIMIT = 25;
export const MAX_INBOX_LIMIT = 100;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_URL_CHARS = 1_000;
const MAX_CATEGORY_CHARS = 160;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeFeedbackCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseFeedbackCursor(value) {
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid cursor");
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed.createdAt) ||
    !Number.isFinite(Date.parse(parsed.createdAt)) ||
    typeof parsed.id !== "string" ||
    !UUID_PATTERN.test(parsed.id)
  ) {
    throw new Error("Invalid cursor");
  }
  return { createdAt: parsed.createdAt, id: parsed.id.toLowerCase() };
}

export function parseInboxArgs(args) {
  const options = { limit: DEFAULT_INBOX_LIMIT, cursor: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--limit") {
      const rawLimit = args[index + 1];
      const limit = Number(rawLimit);
      if (!/^\d+$/.test(rawLimit ?? "") || !Number.isInteger(limit) || limit < 1 || limit > MAX_INBOX_LIMIT) {
        throw new Error(`Limit must be an integer from 1 to ${MAX_INBOX_LIMIT}`);
      }
      options.limit = limit;
      index += 1;
      continue;
    }
    if (argument === "--cursor") {
      options.cursor = parseFeedbackCursor(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error("Unknown or incomplete option");
  }
  return options;
}

export function describeDatabaseTarget(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) throw new Error("SUPPORT_DATABASE_URL must use PostgreSQL");
  return { host: url.hostname, database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "unknown" };
}

export async function fetchFeedbackPage(database, { limit, cursor }) {
  const pageLimit = Number(limit);
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > MAX_INBOX_LIMIT) {
    throw new Error("Invalid page limit");
  }
  const safeCursor = cursor === null ? null : parseFeedbackCursor(encodeFeedbackCursor(cursor));

  const queryRows = (tx) => {
    if (safeCursor) {
      return tx`
        SELECT id, to_char(COALESCE(created_at, to_timestamp(0)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
          LEFT(message, ${MAX_MESSAGE_CHARS}) AS message,
          char_length(message) > ${MAX_MESSAGE_CHARS} AS message_truncated,
          LEFT(category, ${MAX_CATEGORY_CHARS}) AS category,
          char_length(category) > ${MAX_CATEGORY_CHARS} AS category_truncated,
          LEFT(url, ${MAX_URL_CHARS}) AS url,
          char_length(url) > ${MAX_URL_CHARS} AS url_truncated
        FROM public.feedback
        WHERE (COALESCE(created_at, to_timestamp(0)), id) < (${safeCursor.createdAt}::timestamptz, ${safeCursor.id}::uuid)
        ORDER BY COALESCE(created_at, to_timestamp(0)) DESC, id DESC
        LIMIT ${pageLimit + 1}
      `;
    }
    return tx`
      SELECT id, to_char(COALESCE(created_at, to_timestamp(0)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
        LEFT(message, ${MAX_MESSAGE_CHARS}) AS message,
        char_length(message) > ${MAX_MESSAGE_CHARS} AS message_truncated,
        LEFT(category, ${MAX_CATEGORY_CHARS}) AS category,
        char_length(category) > ${MAX_CATEGORY_CHARS} AS category_truncated,
        LEFT(url, ${MAX_URL_CHARS}) AS url,
        char_length(url) > ${MAX_URL_CHARS} AS url_truncated
      FROM public.feedback
      ORDER BY COALESCE(created_at, to_timestamp(0)) DESC, id DESC
      LIMIT ${pageLimit + 1}
    `;
  };

  const [, rows] = await database.transaction((tx) => [
    tx`SET LOCAL statement_timeout = '8s'`,
    queryRows(tx),
  ], { readOnly: true, fetchOptions: { signal: AbortSignal.timeout(10_000) } });
  const hasMore = rows.length > pageLimit;
  const records = rows.slice(0, pageLimit).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    category: row.category,
    message: row.message,
    truncated: {
      message: row.message_truncated === true,
      category: row.category_truncated === true,
      url: row.url_truncated === true,
    },
    url: row.url,
  }));
  const last = records.at(-1);
  const nextCursor = hasMore && last ? encodeFeedbackCursor({ createdAt: last.createdAt, id: last.id }) : null;
  return { records, hasMore, nextCursor };
}

function defaultOutputRoot(env, platform) {
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    if (!localAppData || !isAbsolute(localAppData)) throw new Error("Local application data directory is unavailable");
    return join(localAppData, "Ornigami", "support-inbox");
  }
  const requestedStateHome = env.XDG_STATE_HOME;
  const stateHome = requestedStateHome && isAbsolute(requestedStateHome)
    ? requestedStateHome
    : join(homedir(), ".local", "state");
  return join(stateHome, "ornigami", "support-inbox");
}

function secureWindowsDirectory(directory) {
  try {
    const whoami = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
    const identity = whoami.match(/^\s*"([^"]+)"\s*,\s*"(S-\d-[0-9-]+)"\s*$/);
    if (!identity) throw new Error("Could not identify the current Windows user");
    const [, account, sid] = identity;
    execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const acl = execFileSync("icacls.exe", [directory], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const entries = acl.replace(directory, "").trim().split(/\r?\n/).filter((line) => line.includes(":(") && /\([FMRXW]\)/.test(line));
    const currentAccount = `${account}:`.toLocaleLowerCase("en-US");
    if (entries.length !== 1 || !entries[0].toLocaleLowerCase("en-US").includes(currentAccount) || !entries[0].includes("(F)")) {
      throw new Error(`Artifact ACL check failed (entries=${entries.length}, current-user-match=${entries.some((line) => line.toLocaleLowerCase("en-US").includes(currentAccount))})`);
    }
  } catch (error) {
    throw new Error(error instanceof Error && error.message.startsWith("Artifact ACL check failed")
      ? error.message
      : "Could not secure the artifact directory");
  }
}

export async function writePrivateInboxArtifact({ page, target, now = new Date(), env = process.env, platform = process.platform }) {
  const outputRoot = defaultOutputRoot(env, platform);
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const runDirectory = join(outputRoot, `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`);
  await mkdir(runDirectory, { mode: 0o700 });
  if (platform === "win32") secureWindowsDirectory(runDirectory);
  else await chmod(runDirectory, 0o700);

  const artifact = {
    format: "ornigami-support-inbox-v1",
    generatedAt: now.toISOString(),
    source: target,
    records: page.records,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    privacy: "Contains user-submitted content. Keep this file in the private operator directory and delete it when review is complete.",
  };
  const body = `${JSON.stringify(artifact, null, 2)}\n`;
  if (Buffer.byteLength(body, "utf8") > MAX_ARTIFACT_BYTES) {
    throw new Error("Artifact exceeds the local size limit");
  }

  const artifactPath = join(runDirectory, "inbox.json");
  await writeFile(artifactPath, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
  if (platform !== "win32") await chmod(artifactPath, 0o600);
  return artifactPath;
}

export function usage() {
  return [
    "Read-only operator inbox for existing public.feedback rows.",
    "",
    "Required environment: SUPPORT_DATABASE_URL (a PostgreSQL operator credential with SELECT access to public.feedback).",
    "The CLI never falls back to DATABASE_URL, and never writes feedback or sends email.",
    "Record contents go to a private local JSON artifact; stdout contains counts and the artifact path only.",
    "",
    `Usage: node scripts/support-inbox.mjs [--limit 1-${MAX_INBOX_LIMIT}] [--cursor BASE64URL]`,
    "Copy nextCursor from the private artifact to continue with the next older page.",
  ].join("\n");
}

export async function runSupportInbox({ args = process.argv.slice(2), env = process.env } = {}) {
  const options = parseInboxArgs(args);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const databaseUrl = env.SUPPORT_DATABASE_URL;
  if (!databaseUrl) throw new Error("SUPPORT_DATABASE_URL is required");
  const target = describeDatabaseTarget(databaseUrl);
  const database = neon(databaseUrl);
  const page = await fetchFeedbackPage(database, options);
  const artifactPath = await writePrivateInboxArtifact({ page, target });
  process.stdout.write(`${JSON.stringify({ status: "saved", count: page.records.length, hasMore: page.hasMore, source: target, artifactPath })}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSupportInbox().catch(() => {
    process.stderr.write("Support inbox failed. Check the operator credential and local output directory; record data and credentials were not printed.\n");
    process.exitCode = 1;
  });
}
