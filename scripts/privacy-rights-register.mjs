import { chmod, mkdir, open, readFile, lstat, rename, rmdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const REQUEST_TYPES = new Set(["access", "rectification", "erasure", "restriction", "objection", "portability"]);
const CASE_STATES = new Set(["received", "identity_review", "in_progress", "extension_communicated", "completed", "held", "unresolved"]);
const EVIDENCE_HASH = /^[a-f0-9]{64}$/i;
const HELD_REASONS = new Set(["legal_obligation", "legal_claims", "provider_pending", "other_documented"]);
const UNRESOLVED_REASONS = new Set(["identity_unverified", "scope_unclear", "provider_pending", "other_documented"]);

function parseTimestamp(value, now, errorCode) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) throw new Error(errorCode);
  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y), month = Number(mo), day = Number(d), hour = Number(h), minute = Number(mi), second = Number(s);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() + 1 !== month || local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error(errorCode);
  const zone = match[8];
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4, 6)) > 59 || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4, 6)) !== 0))) throw new Error(errorCode);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > now.getTime()) throw new Error(errorCode);
  return parsed;
}

function addCalendarMonth(value) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

export function parseArgs(args, now = new Date()) {
  const [command, ...rest] = args;
  const values = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (!key.startsWith("--") || values[key.slice(2)] !== undefined || !rest[i + 1] || rest[i + 1].startsWith("--")) {
      throw new Error("invalid_arguments");
    }
    values[key.slice(2)] = rest[++i];
  }
  if (command === "route-receipt") {
    if (Object.keys(values).sort().join(",") !== "evidence-sha256,observed-at,result,route" || !EVIDENCE_HASH.test(values["evidence-sha256"]) || !["delivered", "failed"].includes(values.result) || !["privacy", "support"].includes(values.route)) throw new Error("invalid_route_receipt");
    const observedAt = parseTimestamp(values["observed-at"], now, "invalid_route_receipt");
    return { command, route: values.route, evidenceSha256: values["evidence-sha256"].toLowerCase(), observedAt: observedAt.toISOString(), result: values.result };
  }
  if (command === "open-case") {
    if (Object.keys(values).sort().join(",") !== "evidence-sha256,received-at,type" || !EVIDENCE_HASH.test(values["evidence-sha256"]) || !REQUEST_TYPES.has(values.type)) throw new Error("invalid_case");
    const receivedAt = parseTimestamp(values["received-at"], now, "invalid_case");
    return { command, evidenceSha256: values["evidence-sha256"].toLowerCase(), receivedAt: receivedAt.toISOString(), type: values.type, responseDueAt: addCalendarMonth(receivedAt).toISOString(), acknowledgeDueAt: new Date(receivedAt.getTime() + 86400000).toISOString() };
  }
  if (command === "update-case") {
    const expected = ["case-id", "evidence-sha256", "state"];
    if (values.state === "held" || values.state === "unresolved") expected.push("reason-code", "next-review-at");
    if (values.preserved !== undefined) expected.push("preserved");
    if (values["identity-verified"] !== undefined) expected.push("identity-verified");
    if (values["outcome-documented"] !== undefined) expected.push("outcome-documented");
    if (values["provider-outcome"] !== undefined) expected.push("provider-outcome");
    if (Object.keys(values).sort().join(",") !== expected.sort().join(",") || !/^[0-9a-f-]{36}$/i.test(values["case-id"]) || !EVIDENCE_HASH.test(values["evidence-sha256"]) || !CASE_STATES.has(values.state)) throw new Error("invalid_case_update");
    const preserved = values.preserved === undefined ? [] : values.preserved.split(",");
    if (preserved.some((item) => !["suppression", "trial", "unresolved"].includes(item)) || new Set(preserved).size !== preserved.length) throw new Error("invalid_case_update");
    if (values["identity-verified"] !== undefined && values["identity-verified"] !== "yes") throw new Error("invalid_case_update");
    if (values["outcome-documented"] !== undefined && values["outcome-documented"] !== "yes") throw new Error("invalid_case_update");
    if (values["provider-outcome"] !== undefined && values["provider-outcome"] !== "documented") throw new Error("invalid_case_update");
    if (values.state === "completed" && values["outcome-documented"] !== "yes") throw new Error("invalid_case_update");
    let nextReviewAt = null;
    if (values.state === "held" || values.state === "unresolved") {
      const reasons = values.state === "held" ? HELD_REASONS : UNRESOLVED_REASONS;
      if (!reasons.has(values["reason-code"])) throw new Error("invalid_case_update");
      const requested = new Date(values["next-review-at"]);
      if (!Number.isFinite(requested.getTime()) || requested.toISOString() !== values["next-review-at"] || requested <= now || requested.getTime() > now.getTime() + 30 * 86400000) throw new Error("invalid_case_update");
      nextReviewAt = requested.toISOString();
    }
    return { command, caseId: values["case-id"], evidenceSha256: values["evidence-sha256"].toLowerCase(), state: values.state, preserved, identityVerified: values["identity-verified"] === "yes", outcomeDocumented: values["outcome-documented"] === "yes", providerOutcomeDocumented: values["provider-outcome"] === "documented", reasonCode: values["reason-code"] ?? null, nextReviewAt };
  }
  if (command === "cleanup") {
    if (Object.keys(values).some((key) => key !== "apply") || (values.apply !== undefined && values.apply !== "yes")) throw new Error("invalid_cleanup");
    return { command, apply: values.apply === "yes" };
  }
  if (command === "--help" || command === "-h") return { command: "help" };
  throw new Error("invalid_arguments");
}

function outputRoot(env, platform) {
  if (platform === "win32") {
    if (!env.LOCALAPPDATA || !/^[A-Za-z]:\\/.test(env.LOCALAPPDATA)) throw new Error("private_directory_unavailable");
    return join(env.LOCALAPPDATA, "Ornigami", "privacy-rights");
  }
  const stateHome = env.XDG_STATE_HOME && isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : join(homedir(), ".local", "state");
  return join(stateHome, "ornigami", "privacy-rights");
}

function setWindowsDirectoryPermissions(directory) {
  const whoami = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
  const identity = whoami.match(/^\s*"([^"]+)"\s*,\s*"(S-1-[0-9-]+)"\s*$/);
  const account = identity?.[1];
  const sid = identity?.[2];
  if (!account || !sid) throw new Error("private_directory_security_failed");
  execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { stdio: "ignore", windowsHide: true });
  verifyWindowsAcl(directory, account);
}

function verifyWindowsAcl(path, expectedAccount) {
  const acl = execFileSync("icacls.exe", [path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).replace(path, "");
  const entries = acl.split(/\r?\n/).filter((line) => line.includes(":(") && /\([FMRXW]\)/.test(line));
  if (entries.length !== 1 || !entries[0].toLocaleLowerCase("en-US").includes(`${expectedAccount}:`.toLocaleLowerCase("en-US")) || !entries[0].includes("(F)")) throw new Error("private_directory_security_failed");
}

function validateStore(store) {
  if (!store || store.format !== "ornigami-privacy-rights-register-v1" || !Array.isArray(store.cases) || !Array.isArray(store.routingReceipts)) throw new Error("register_schema_invalid");
  for (const entry of store.routingReceipts) {
    const expectedSource = entry?.route === "privacy" ? "privacy@ornigami.com" : entry?.route === "support" ? "support@ornigami.com" : null;
    if (!entry || !expectedSource || entry.source !== expectedSource || entry.destination !== "jose_private_workflow" || !["delivered", "failed"].includes(entry.result) || !EVIDENCE_HASH.test(entry.evidenceSha256) || !Number.isFinite(Date.parse(entry.observedAt))) throw new Error("register_schema_invalid");
  }
  for (const item of store.cases) {
    if (!item || !/^[0-9a-f-]{36}$/i.test(item.id) || !REQUEST_TYPES.has(item.type) || !CASE_STATES.has(item.status) || !EVIDENCE_HASH.test(item.evidenceSha256) || !Array.isArray(item.events) || !item.safeguards || !["suppression", "trial", "unresolved"].every((key) => {
      const check = item.safeguards[key];
      return check?.status === "pending" ? check.evidenceSha256 === null && check.verifiedAt === null
        : check?.status === "verified" && EVIDENCE_HASH.test(check.evidenceSha256) && Number.isFinite(Date.parse(check.verifiedAt));
    })) throw new Error("register_schema_invalid");
    if ((item.status === "held" && !HELD_REASONS.has(item.reasonCode)) || (item.status === "unresolved" && !UNRESOLVED_REASONS.has(item.reasonCode)) || ((item.status === "held" || item.status === "unresolved") && !Number.isFinite(Date.parse(item.nextReviewAt)))) throw new Error("register_schema_invalid");
    if (item.providerResolutionRequired !== undefined && typeof item.providerResolutionRequired !== "boolean") throw new Error("register_schema_invalid");
    if (item.providerResolutionRequired === true && item.providerResolutionEvidenceSha256 !== null) throw new Error("register_schema_invalid");
    if (item.providerResolutionEvidenceSha256 !== null && item.providerResolutionEvidenceSha256 !== undefined && !EVIDENCE_HASH.test(item.providerResolutionEvidenceSha256)) throw new Error("register_schema_invalid");
    if (item.providerResolutionAt !== undefined && item.providerResolutionAt !== null && !Number.isFinite(Date.parse(item.providerResolutionAt))) throw new Error("register_schema_invalid");
    if ((item.status === "held" || item.status === "unresolved") && item.reasonCode === "provider_pending" && item.providerResolutionRequired !== true) throw new Error("register_schema_invalid");
    if (item.events.some((event) => !event || !CASE_STATES.has(event.state) || !EVIDENCE_HASH.test(event.evidenceSha256) || !Number.isFinite(Date.parse(event.recordedAt)))) throw new Error("register_schema_invalid");
    if (item.identityVerifiedAt !== null && !Number.isFinite(Date.parse(item.identityVerifiedAt))) throw new Error("register_schema_invalid");
    if (item.status === "completed" && (!item.identityVerifiedAt || !Number.isFinite(Date.parse(item.completedAt)) || Object.values(item.safeguards).some((check) => check.status !== "verified") || !item.events.at(-1)?.outcomeDocumented || (item.events.some((event) => event.reasonCode === "provider_pending") && (!item.providerResolutionEvidenceSha256 || !item.providerResolutionAt)))) throw new Error("register_schema_invalid");
  }
  return store;
}

async function acquireLock(lockPath, platform) {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      if (platform === "win32") setWindowsDirectoryPermissions(lockPath);
      else await chmod(lockPath, 0o700);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST" || Date.now() >= deadline) throw new Error("register_busy");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

async function persist(event, { env = process.env, platform = process.platform, now = new Date() } = {}) {
  const root = outputRoot(env, platform);
  let rootExisted = true;
  try { await lstat(root); } catch (error) { if (error?.code === "ENOENT") rootExisted = false; else throw new Error("register_path_invalid"); }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("register_path_invalid");
  if (platform === "win32") {
    const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim().match(/^\s*"([^"]+)"/);
    if (!identity?.[1]) throw new Error("private_directory_security_failed");
    if (rootExisted) verifyWindowsAcl(root, identity[1]);
    else setWindowsDirectoryPermissions(root);
  }
  else await chmod(root, 0o700);
  const storePath = join(root, "register.json");
  const lockPath = join(root, "register.lock");
  await acquireLock(lockPath, platform);
  let temporaryPath;
  try {
    let store = { format: "ornigami-privacy-rights-register-v1", cases: [], routingReceipts: [] };
    try {
      const fileInfo = await lstat(storePath);
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) throw new Error("register_path_invalid");
      if (platform === "win32") {
        const account = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim().match(/^\s*"([^"]+)"/)?.[1];
        if (!account) throw new Error("private_directory_security_failed");
        verifyWindowsAcl(storePath, account);
      }
      store = validateStore(JSON.parse(await readFile(storePath, "utf8")));
    } catch (error) { if (error?.code !== "ENOENT") throw error?.message?.startsWith("register_") || error?.message === "private_directory_security_failed" ? error : new Error("register_read_failed"); }
    if (event.command === "cleanup") {
      const cutoff = now.getTime() - 365 * 86400000;
      const eligible = (item) => item.status === "completed" && item.providerResolutionRequired === false
        && Number.isFinite(Date.parse(item.completedAt)) && Date.parse(item.completedAt) <= cutoff
        && Object.values(item.safeguards).every((check) => check.status === "verified");
      const eligibleCount = store.cases.filter(eligible).length;
      if (event.apply && eligibleCount > 0) store.cases = store.cases.filter((item) => !eligible(item));
      if (event.apply && eligibleCount > 0) {
        temporaryPath = `${storePath}.${randomUUID()}.tmp`;
        const file = await open(temporaryPath, "wx", 0o600);
        try { await file.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8"); } finally { await file.close(); }
        if (platform !== "win32") await chmod(temporaryPath, 0o600);
        else {
          const account = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim().match(/^\s*"([^"]+)"/)?.[1];
          if (!account) throw new Error("private_directory_security_failed");
          verifyWindowsAcl(temporaryPath, account);
        }
        await rename(temporaryPath, storePath);
        temporaryPath = undefined;
      }
      return { eligibleCount, removedCount: event.apply ? eligibleCount : 0, dryRun: !event.apply };
    } else if (event.command === "route-receipt") {
      store.routingReceipts.push({ route: event.route, source: event.route === "privacy" ? "privacy@ornigami.com" : "support@ornigami.com", destination: "jose_private_workflow", observedAt: event.observedAt, result: event.result, evidenceSha256: event.evidenceSha256 });
    } else if (event.command === "open-case") {
      const item = { id: randomUUID(), type: event.type, receivedAt: event.receivedAt, acknowledgeDueAt: event.acknowledgeDueAt, responseDueAt: event.responseDueAt, status: "received", evidenceSha256: event.evidenceSha256, events: [], identityVerifiedAt: null, providerResolutionRequired: false, providerResolutionEvidenceSha256: null, safeguards: Object.fromEntries(["suppression", "trial", "unresolved"].map((key) => [key, { status: "pending", evidenceSha256: null, verifiedAt: null }])) };
      store.cases.push(item);
      event.caseId = item.id;
    } else {
      const item = store.cases.find((entry) => entry.id === event.caseId);
      if (!item) throw new Error("case_not_found");
      if ((event.state === "held" || event.state === "unresolved") && event.reasonCode === "provider_pending") item.providerResolutionRequired = true;
      if (item.providerResolutionRequired && event.state !== "held" && event.state !== "unresolved") {
        if (!event.providerOutcomeDocumented) throw new Error("provider_outcome_required");
        item.providerResolutionRequired = false;
        item.providerResolutionEvidenceSha256 = event.evidenceSha256;
        item.providerResolutionAt = now.toISOString();
      }
      if (event.state === "identity_review" && event.identityVerified) item.identityVerifiedAt = now.toISOString();
      if (event.state === "completed" && (!item.identityVerifiedAt || !event.outcomeDocumented || item.providerResolutionRequired || Object.values(item.safeguards).some((value) => value.status !== "verified"))) throw new Error("case_completion_gates_open");
      if ((event.state === "held" || event.state === "unresolved") && event.nextReviewAt <= now.toISOString()) throw new Error("invalid_case_update");
      for (const key of event.preserved) item.safeguards[key] = { status: "verified", evidenceSha256: event.evidenceSha256, verifiedAt: now.toISOString() };
      item.status = event.state;
      if (event.state === "completed") item.completedAt = now.toISOString();
      item.events.push({ recordedAt: now.toISOString(), state: event.state, evidenceSha256: event.evidenceSha256, reasonCode: event.reasonCode, nextReviewAt: event.nextReviewAt, identityVerified: event.identityVerified, outcomeDocumented: event.outcomeDocumented, providerOutcomeDocumented: event.providerOutcomeDocumented, preserved: event.preserved });
      if (event.state === "held" || event.state === "unresolved") { item.reasonCode = event.reasonCode; item.nextReviewAt = event.nextReviewAt; }
    }
    temporaryPath = `${storePath}.${randomUUID()}.tmp`;
    const file = await open(temporaryPath, "wx", 0o600);
    try { await file.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8"); } finally { await file.close(); }
    if (platform !== "win32") await chmod(temporaryPath, 0o600);
    else {
      const account = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim().match(/^\s*"([^"]+)"/)?.[1];
      if (!account) throw new Error("private_directory_security_failed");
      verifyWindowsAcl(temporaryPath, account);
    }
    await rename(temporaryPath, storePath);
    temporaryPath = undefined;
    return { path: storePath, caseId: event.caseId };
  } finally {
    if (temporaryPath) await unlink(temporaryPath).catch(() => {});
    await rmdir(lockPath).catch(() => {});
  }
}

export async function processEvent(args, options = {}) {
  const event = parseArgs(args, options.now ?? new Date());
  if (event.command === "help") return { help: true };
  return persist(event, options);
}

export function usage() {
  return [
    "Private local register for privacy routing checks and assisted rights handling.",
    "Stores request category, dates, state and SHA-256 evidence references only; never enter names, addresses or request text.",
    "Evidence hashes do not prove delivery or legal compliance. Route receipts must follow a real send-and-receive check.",
    "",
    "node scripts/privacy-rights-register.mjs route-receipt --route privacy|support --observed-at ISO --result delivered|failed --evidence-sha256 HASH",
    "node scripts/privacy-rights-register.mjs open-case --received-at ISO --type access|rectification|erasure|restriction|objection|portability --evidence-sha256 HASH",
    "For identity_review, use --identity-verified yes only after verification. Completion requires that receipt, all three --preserved checks, and --outcome-documented yes.",
    "If held/unresolved for provider_pending, leaving that state requires --provider-outcome documented with its evidence hash.",
    "Cleanup keeps routing receipts and removes only completed, fully evidenced cases at least 365 days old. Dry run is the default.",
    "held/unresolved updates require a bounded --reason-code and --next-review-at no more than 30 days away.",
    "node scripts/privacy-rights-register.mjs update-case --case-id UUID --state STATE --evidence-sha256 HASH [--preserved suppression,trial,unresolved] [--identity-verified yes] [--outcome-documented yes] [--provider-outcome documented] [--reason-code CODE --next-review-at ISO]",
    "node scripts/privacy-rights-register.mjs cleanup [--apply yes]",
    "Response deadline is set to one calendar month; extension handling and acknowledgment deadlines remain visible.",
  ].join("\n");
}

async function main() {
  if (process.argv[2] === "--help" || process.argv[2] === "-h") { process.stdout.write(`${usage()}\n`); return; }
  const result = await processEvent(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${["invalid_arguments", "invalid_route_receipt", "invalid_case", "invalid_case_update", "invalid_cleanup", "case_not_found", "case_completion_gates_open", "provider_outcome_required", "register_busy", "register_path_invalid", "register_schema_invalid", "private_directory_unavailable", "private_directory_security_failed", "register_read_failed"].includes(error?.message) ? error.message : "privacy_rights_register_failed"}\n`);
    process.exitCode = 2;
  });
}
