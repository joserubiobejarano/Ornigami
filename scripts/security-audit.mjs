import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

function fail(message) {
  return { ok: false, errors: [message], fullCounts: null, productionCounts: null };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAudit(report, label) {
  if (!isRecord(report)) return { error: `${label} report is not an object` };
  if (report.auditReportVersion !== 2) {
    return { error: `${label} audit report has an unsupported or missing report version` };
  }
  if (report.error !== undefined) {
    const detail = isRecord(report.error)
      ? report.error.summary ?? report.error.code ?? "unknown error"
      : "malformed error details";
    return { error: `${label} audit reported an error: ${detail}` };
  }
  if (!isRecord(report.vulnerabilities)) {
    return { error: `${label} audit report has no vulnerabilities map` };
  }
  if (!isRecord(report.metadata) || !isRecord(report.metadata.vulnerabilities)) {
    return { error: `${label} audit report has no vulnerabilities metadata` };
  }

  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!name || !isRecord(vulnerability) || !SEVERITIES.includes(vulnerability.severity)) {
      return { error: `${label} audit contains a malformed vulnerability entry` };
    }
    counts[vulnerability.severity] += 1;
  }

  const metadataCounts = report.metadata.vulnerabilities;
  for (const severity of SEVERITIES) {
    const count = metadataCounts[severity];
    if (!Number.isSafeInteger(count) || count < 0) {
      return { error: `${label} audit metadata has a malformed ${severity} count` };
    }
    if (count !== counts[severity]) {
      return { error: `${label} audit metadata ${severity} count does not match its vulnerability entries` };
    }
  }
  const total = metadataCounts.total;
  const entryTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (!Number.isSafeInteger(total) || total < 0 || total !== entryTotal) {
    return { error: `${label} audit metadata total does not match its vulnerability entries` };
  }

  return { counts, total };
}

/** Pure, fail-closed policy evaluation for full and production npm audit JSON reports. */
export function evaluateAuditReports(fullReport, productionReport) {
  const full = parseAudit(fullReport, "Full");
  if (full.error) return fail(full.error);
  const production = parseAudit(productionReport, "Production");
  if (production.error) return fail(production.error);

  if (full.total > 0) {
    return fail(`Full audit contains ${full.total} vulnerabilities; all full-audit findings must be remediated`);
  }
  if (production.counts.high > 0 || production.counts.critical > 0) {
    return fail("Production audit contains high or critical vulnerabilities");
  }

  return {
    ok: true,
    errors: [],
    fullCounts: full.counts,
    productionCounts: production.counts,
  };
}

/** Check npm's documented exit status against the parsed findings before applying policy. */
export function evaluateAuditResults(fullResult, productionResult) {
  for (const [label, result] of [["Full", fullResult], ["Production", productionResult]]) {
    if (!isRecord(result)) return fail(`${label} npm audit result is malformed`);
    if (result.error) return fail(result.error);
    if (![0, 1].includes(result.status)) {
      return fail(`${label} npm audit exited with an unexpected status; inspect network, registry, and npm output`);
    }
  }

  const result = evaluateAuditReports(fullResult.report, productionResult.report);
  if (!result.ok) return result;

  const fullHasFindings = Object.values(result.fullCounts).some((count) => count > 0);
  const productionHasFindings = Object.values(result.productionCounts).some((count) => count > 0);
  if ((fullResult.status === 1) !== fullHasFindings) {
    return fail("Full npm audit exit status does not match its reported findings");
  }
  if ((productionResult.status === 1) !== productionHasFindings) {
    return fail("Production npm audit exit status does not match its reported findings");
  }

  return result;
}

/** Convert npm's JSON stdout into an audit result, keeping malformed output fail-closed. */
export function parseAuditOutput(stdout, status, stderr = "") {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return {
      error: `Could not parse npm audit JSON (exit ${status ?? "unknown"}): ${stderr.trim() || "empty output"}`,
    };
  }
  return { report, status, stderr };
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
  return parseAuditOutput(result.stdout, result.status, result.stderr ?? "");
}

export function runSecurityAudit() {
  const full = runAudit(false);
  if (full.error) return fail(full.error);
  const production = runAudit(true);
  if (production.error) return fail(production.error);
  return evaluateAuditResults(full, production);
}

function main() {
  const result = runSecurityAudit();
  if (!result.ok) {
    console.error(`Security audit failed: ${result.errors.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Full dependency audit: ${JSON.stringify(result.fullCounts)}; findings: 0.`);
  console.log(`Production dependency audit: ${JSON.stringify(result.productionCounts)}; high/critical findings: 0.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
