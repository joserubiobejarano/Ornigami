import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ALLOWED_ADVISORY_URL = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const EXCEPTION_EXPIRES_AT = "2026-10-10T00:00:00Z";

const SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

function fail(message) {
  return { ok: false, errors: [message], allowed: [], productionCounts: null };
}

function parseAudit(report, label) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return `${label} report is not an object`;
  if (report.error) return `${label} audit reported an error: ${report.error.summary ?? report.error.code ?? "unknown error"}`;
  if (!report.vulnerabilities || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)) {
    return `${label} audit report has no vulnerabilities map`;
  }
  return null;
}

function severityCounts(report) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    if (!vulnerability || typeof vulnerability !== "object" || !SEVERITIES.has(vulnerability.severity)) return null;
    counts[vulnerability.severity] += 1;
  }
  return counts;
}

function ancestryIsOnlyAllowedAdvisory(name, vulnerabilities) {
  const visiting = new Set();
  const visited = new Map();
  function visit(packageName) {
    if (visiting.has(packageName)) return false;
    if (visited.has(packageName)) return visited.get(packageName);
    const item = vulnerabilities[packageName];
    if (!item || typeof item !== "object" || !Array.isArray(item.via) || item.via.length === 0) return false;
    visiting.add(packageName);
    let valid = true;
    for (const via of item.via) {
      if (typeof via === "string") {
        if (!visit(via)) { valid = false; break; }
      } else if (!via || typeof via !== "object" || via.url !== ALLOWED_ADVISORY_URL) {
        valid = false;
        break;
      }
    }
    visiting.delete(packageName);
    visited.set(packageName, valid);
    return valid;
  }
  return visit(name);
}

/** Pure, fail-closed policy evaluation for full and production npm audit JSON reports. */
export function evaluateAuditReports(fullReport, productionReport, now = new Date()) {
  const fullError = parseAudit(fullReport, "Full");
  if (fullError) return fail(fullError);
  const productionError = parseAudit(productionReport, "Production");
  if (productionError) return fail(productionError);
  const instant = now instanceof Date ? now.getTime() : Date.parse(now);
  const expires = Date.parse(EXCEPTION_EXPIRES_AT);
  if (Object.keys(fullReport.vulnerabilities).length > 0 && (!Number.isFinite(instant) || instant >= expires)) {
    return fail("Temporary advisory exception is expired or evaluation time is invalid");
  }

  const fullCounts = severityCounts(fullReport);
  const productionCounts = severityCounts(productionReport);
  if (!fullCounts || !productionCounts) return fail("Audit report contains an unknown or malformed vulnerability severity");
  const prodMetadata = productionReport.metadata?.vulnerabilities;
  if (prodMetadata && ["high", "critical"].some((level) => Number(prodMetadata[level]) > 0)) {
    return fail("Production audit metadata reports high or critical vulnerabilities");
  }
  if (productionCounts.high > 0 || productionCounts.critical > 0) return fail("Production audit contains high or critical vulnerabilities");

  const allowed = [];
  for (const [name, vulnerability] of Object.entries(fullReport.vulnerabilities)) {
    if (!ancestryIsOnlyAllowedAdvisory(name, fullReport.vulnerabilities)) {
      return fail(`Full audit vulnerability ${name} does not resolve exclusively to the temporary allowed advisory`);
    }
    allowed.push({ name, severity: vulnerability.severity });
  }
  return { ok: true, errors: [], allowed, fullCounts, productionCounts };
}

function npmCommand() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) return { command: process.execPath, prefix: [npmExecPath] };
  const localCli = resolve("node_modules/npm/bin/npm-cli.js");
  if (existsSync(localCli)) return { command: process.execPath, prefix: [localCli] };
  const adjacentCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(adjacentCli)) return { command: process.execPath, prefix: [adjacentCli] };
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [] };
}

function runAudit(omitDev) {
  const npm = npmCommand();
  const args = [...npm.prefix, "audit", "--json", ...(omitDev ? ["--omit=dev"] : [])];
  const result = spawnSync(npm.command, args, { encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) return { error: `Could not run npm audit: ${result.error.message}` };
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return { error: `Could not parse npm audit JSON (exit ${result.status ?? "unknown"}): ${result.stderr?.trim() || "empty output"}` }; }
  return { report, status: result.status, stderr: result.stderr };
}

export function runSecurityAudit() {
  const full = runAudit(false);
  if (full.error) return fail(full.error);
  const production = runAudit(true);
  if (production.error) return fail(production.error);
  if (![0, 1].includes(full.status) || ![0, 1].includes(production.status)) {
    return fail("npm audit exited with an unexpected status; inspect network, registry, and npm output");
  }
  const result = evaluateAuditReports(full.report, production.report);
  if (!result.ok) return result;
  // npm exits 1 for findings at any severity; production policy only rejects high/critical.
  if ((full.status === 1 && result.allowed.length === 0) || (production.status === 1 && Object.keys(production.report.vulnerabilities).length === 0)) {
    return fail("npm audit exited unsuccessfully without reported findings; inspect network, registry, and npm output");
  }
  return result;
}

function main() {
  const result = runSecurityAudit();
  if (!result.ok) {
    console.error(`Security audit failed: ${result.errors.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Full dependency audit: ${JSON.stringify(result.fullCounts)}; allowed advisory-chain records: ${result.allowed.length}.`);
  if (result.allowed.length) console.log(`Temporary exception: ${ALLOWED_ADVISORY_URL} (expires ${EXCEPTION_EXPIRES_AT}); records: ${result.allowed.map((item) => `${item.name}:${item.severity}`).join(", ")}`);
  console.log(`Production dependency audit: ${JSON.stringify(result.productionCounts)}; high/critical findings: 0.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
