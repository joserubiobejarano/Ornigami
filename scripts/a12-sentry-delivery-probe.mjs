import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ALLOWED_KEYS = new Set(["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]);
const FIXED_MESSAGE = "A12 controlled Sentry transport probe";
const MAX_RESPONSE_BYTES = 64_000;
const TIMEOUT_MS = 8_000;

export function loadAllowlistedEnv(path) {
  const source = readFileSync(path, "utf8");
  if (Buffer.byteLength(source, "utf8") > MAX_RESPONSE_BYTES) throw new Error("configuration_source_invalid");
  const env = Object.create(null);
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !ALLOWED_KEYS.has(match[1])) continue;
    const [, key, raw] = match;
    const value = raw.trim().replace(/^(["'])(.*)\1$/, "$2").replace(/\s+#.*$/, "").trim();
    if (Object.hasOwn(env, key)) throw new Error("configuration_source_invalid");
    env[key] = value;
  }
  return env;
}

export function parseConfig(env) {
  const { NEXT_PUBLIC_SENTRY_DSN: dsn, SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: project } = env;
  if (!dsn || !token || !org || !project || !/^[a-z0-9_-]+$/i.test(org) || !/^[a-z0-9_-]+$/i.test(project)) {
    throw new Error("sentry_probe_configuration_missing");
  }
  const url = new URL(dsn);
  const match = /^\/(\d+)\/?$/.exec(url.pathname);
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || !/^o\d+\.ingest(?:\.(?:eu|de|us))?\.sentry\.io$/i.test(url.hostname) || !match || !url.username || url.password || url.search || url.hash) {
    throw new Error("sentry_probe_configuration_invalid");
  }
  const apiRegion = /\.ingest\.(eu|de|us)\.sentry\.io$/i.exec(url.hostname)?.[1]?.toLowerCase();
  const apiOrigin = apiRegion ? `https://${apiRegion}.sentry.io` : "https://sentry.io";
  return { dsn, publicKey: decodeURIComponent(url.username), projectId: match[1], token, org, project, apiOrigin };
}

async function boundedJson(response) {
  if (!response.body || Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new Error("sentry_response_too_large");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("sentry_response_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")); }
  catch { throw new Error("sentry_response_invalid"); }
}

export async function verifySentryProject(config, { fetcher = fetch } = {}) {
  const url = new URL(`/api/0/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/`, config.apiOrigin);
  const response = await fetcher(url, {
    method: "GET", headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
    redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("sentry_project_redirect_refused"); }
  if (!response.ok) { await response.body?.cancel(); return { status: "project_read_failed", httpStatus: response.status }; }
  const body = await boundedJson(response);
  const matches = String(body.id) === config.projectId && body.slug === config.project && body.organization?.slug === config.org;
  return { status: matches ? "project_identity_verified" : "project_identity_mismatch", httpStatus: response.status };
}

export async function inspectSentryWorkflows(config, { fetcher = fetch, maxPages = 5 } = {}) {
  const project = await verifySentryProject(config, { fetcher });
  if (project.status !== "project_identity_verified") return project;
  const url = new URL(`/api/0/organizations/${encodeURIComponent(config.org)}/workflows/`, config.apiOrigin);
  url.searchParams.set("project", config.projectId);
  url.searchParams.set("per_page", "100");
  let cursor;
  let pageCount = 0;
  let completeInventory = true;
  const workflows = [];
  for (let page = 0; page < maxPages; page += 1) {
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetcher(url, {
      method: "GET", headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
      redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    pageCount += 1;
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("sentry_workflows_redirect_refused"); }
    if (!response.ok) { const httpStatus = response.status; await response.body?.cancel(); return { status: "workflows_read_failed", httpStatus, pagesRead: pageCount }; }
    const rows = await boundedJson(response);
    if (!Array.isArray(rows)) return { status: "workflows_response_invalid", pagesRead: pageCount };
    workflows.push(...rows);
    const link = response.headers.get("link") || "";
    const next = link.split(",").find((item) => /rel="next"/.test(item) && /results="true"/.test(item));
    const nextCursor = next && /cursor="([^"]+)"/.exec(next)?.[1];
    if (!nextCursor) break;
    if (page === maxPages - 1) { completeInventory = false; break; }
    cursor = nextCursor;
  }

  const actionTypeCounts = Object.create(null);
  const actionStatusCounts = Object.create(null);
  const routingTargetTypeCounts = Object.create(null);
  const lastTriggeredDates = [];
  let enabledCount = 0;
  for (const workflow of workflows) {
    if (workflow.enabled === true) enabledCount += 1;
    if (typeof workflow.lastTriggered === "string" && !Number.isNaN(Date.parse(workflow.lastTriggered))) {
      lastTriggeredDates.push(new Date(workflow.lastTriggered).toISOString());
    }
    for (const filter of Array.isArray(workflow.actionFilters) ? workflow.actionFilters : []) {
      for (const action of Array.isArray(filter?.actions) ? filter.actions : []) {
        const type = typeof action?.type === "string" ? action.type : "unknown";
        const status = typeof action?.status === "string" ? action.status : "unknown";
        const targetType = typeof action?.config?.targetType === "string" ? action.config.targetType : "unspecified";
        actionTypeCounts[type] = (actionTypeCounts[type] || 0) + 1;
        actionStatusCounts[status] = (actionStatusCounts[status] || 0) + 1;
        routingTargetTypeCounts[targetType] = (routingTargetTypeCounts[targetType] || 0) + 1;
      }
    }
  }
  return {
    status: "workflows_read",
    workflowCount: workflows.length,
    enabledCount,
    disabledCount: workflows.length - enabledCount,
    actionTypeCounts,
    actionStatusCounts,
    routingTargetTypeCounts,
    lastTriggeredDates,
    pagesRead: pageCount,
    completeInventory,
  };
}

export async function sendAndVerifySentryProbe(config, { fetcher = fetch, now = () => new Date() } = {}) {
  const eventId = randomBytes(16).toString("hex");
  const timestamp = now().toISOString();
  const event = {
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level: "error",
    logger: "cron-alerts",
    message: FIXED_MESSAGE,
    tags: { subsystem: "cron", job: "privacy_retention", reason: "controlled_smoke", probe_id: eventId },
  };
  const envelope = [
    JSON.stringify({ event_id: eventId, dsn: config.dsn, sent_at: timestamp, sdk: { name: "sentry.javascript.node", version: "10.69.0" } }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
    "",
  ].join("\n");
  const ingestUrl = new URL(`/api/${config.projectId}/envelope/`, new URL(config.dsn).origin);
  const ingest = await fetcher(ingestUrl, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_client=a12-probe/1.0, sentry_key=${config.publicKey}` },
    body: envelope,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (ingest.status >= 300 && ingest.status < 400) { await ingest.body?.cancel(); throw new Error("sentry_ingest_redirect_refused"); }
  if (!ingest.ok) { const ingestStatus = ingest.status; await ingest.body?.cancel(); return { status: "ingest_rejected", ingestStatus, readback: "not_attempted", eventId }; }
  await ingest.body?.cancel();

  const readback = await readBackSentryEvent(config, eventId, { fetcher });
  return { ...readback, ingestStatus: ingest.status, eventId };
}

export async function readBackSentryEvent(config, eventId, { fetcher = fetch, retries = 8, retryDelayMs = 2_000 } = {}) {
  if (!/^[0-9a-f]{32}$/i.test(eventId)) throw new Error("sentry_event_id_invalid");
  const eventUrl = new URL(`/api/0/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/events/${eventId}/`, config.apiOrigin);
  let readbackStatus = 0;
  const deadline = Date.now() + 40_000;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const response = await fetcher(eventUrl, {
      method: "GET", headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
      redirect: "manual", signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remainingMs)),
    });
    readbackStatus = response.status;
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("sentry_readback_redirect_refused"); }
    if (response.ok) {
      const body = await boundedJson(response);
      const tags = Array.isArray(body.tags) ? Object.fromEntries(body.tags.map((tag) => [tag.key, tag.value])) : body.tags;
      const matches = (body.eventID || body.event_id) === eventId && body.message === FIXED_MESSAGE &&
        tags?.subsystem === "cron" && tags?.job === "privacy_retention" && tags?.reason === "controlled_smoke" && tags?.probe_id === eventId;
      const dateReceived = typeof body.dateReceived === "string" && !Number.isNaN(Date.parse(body.dateReceived)) ? new Date(body.dateReceived).toISOString() : null;
      return { status: matches ? "ingested_and_read_back" : "readback_mismatch", readbackStatus, readback: matches ? "matched" : "mismatched", dateReceived };
    }
    if (response.status !== 404 || attempt === retries) { await response.body?.cancel(); break; }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelayMs, Math.max(0, deadline - Date.now()))));
  }
  return { status: "ingested_readback_unavailable", readbackStatus, readback: "unavailable" };
}

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("usage: node scripts/a12-sentry-delivery-probe.mjs <explicit-main-env-local>");
  const config = parseConfig(loadAllowlistedEnv(source));
  const mode = process.argv[3] || "--check-project";
  let result;
  if (mode === "--readback") {
    result = await readBackSentryEvent(config, process.argv[4]);
  } else if (mode === "--check-project") {
    result = await verifySentryProject(config);
  } else if (mode === "--inspect-workflows") {
    result = await inspectSentryWorkflows(config);
  } else if (mode === "--send-probe") {
    const project = await verifySentryProject(config);
    result = project.status === "project_identity_verified" ? await sendAndVerifySentryProbe(config) : project;
  } else {
    throw new Error("sentry_probe_mode_invalid");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = ["ingested_and_read_back", "project_identity_verified", "workflows_read"].includes(result.status) ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const allowed = new Set(["sentry_probe_configuration_invalid", "sentry_probe_configuration_missing", "sentry_probe_mode_invalid", "sentry_response_too_large", "sentry_response_invalid", "sentry_project_redirect_refused", "sentry_workflows_redirect_refused", "sentry_ingest_redirect_refused", "sentry_readback_redirect_refused", "sentry_event_id_invalid"]);
    process.stderr.write(`${allowed.has(error?.message) ? error.message : "sentry_probe_failed"}\n`);
    process.exitCode = 2;
  });
}
