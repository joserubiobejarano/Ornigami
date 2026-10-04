import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSupportTarget } from "./a12-support-access-verify.mjs";

const SQL_FILE = fileURLToPath(new URL("../docs/tasks/A12_SUPPORT_ACCESS.sql", import.meta.url));

export function parseProvisionArgs(args) {
  const options = { apply: false, adminEnv: null, expectedHost: null, expectedDatabase: null };
  const names = new Map([["--admin-env", "adminEnv"], ["--expected-host", "expectedHost"], ["--expected-database", "expectedDatabase"]]);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--apply") { options.apply = true; continue; }
    if (!["--admin-env", "--expected-host", "--expected-database"].includes(value) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("usage: node scripts/a12-support-access-provision.mjs --admin-env PRIVATE_FILE --expected-host HOST --expected-database DB [--apply]");
    }
    const name = names.get(value);
    if (options[name]) throw new Error("duplicate_option");
    options[name] = args[index + 1];
    index += 1;
  }
  if (!options.adminEnv || !options.expectedHost || !options.expectedDatabase) throw new Error("required_option_missing");
  options.expectedHost = options.expectedHost.toLowerCase();
  return options;
}

export function readAdminConnection(file, expectedHost, expectedDatabase) {
  let source;
  try { source = readFileSync(file, "utf8"); } catch { throw new Error("admin_credential_file_unavailable"); }
  if (Buffer.byteLength(source, "utf8") > 16_384) throw new Error("admin_credential_file_invalid");
  const found = [];
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] !== "DATABASE_URL") continue;
    found.push(match[2].trim().replace(/^("|')(.*)\1$/, "$2"));
  }
  if (found.length !== 1) throw new Error("admin_credential_file_invalid");
  let target;
  try { target = parseSupportTarget(found[0]); } catch { throw new Error("admin_connection_invalid"); }
  if (target.host !== expectedHost || target.database !== expectedDatabase || target.user === "ornigami_support_reader") {
    throw new Error("admin_target_identity_mismatch");
  }
  return target;
}

function childEnvironment(target, sourceEnv) {
  const env = Object.create(null);
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "PATHEXT", "ComSpec", "TEMP", "TMP"]) if (sourceEnv[key]) env[key] = sourceEnv[key];
  Object.assign(env, {
    PGHOST: target.host,
    PGPORT: target.port,
    PGUSER: target.user,
    PGPASSWORD: target.password,
    PGDATABASE: target.database,
    PGSSLMODE: target.sslmode,
    PGCONNECT_TIMEOUT: "10",
  });
  if (target.channelBinding) env.PGCHANNELBINDING = target.channelBinding;
  return env;
}

export function provisionSupportAccess({ args = process.argv.slice(2), env = process.env, psql = execFileSync } = {}) {
  const options = parseProvisionArgs(args);
  const target = readAdminConnection(options.adminEnv, options.expectedHost, options.expectedDatabase);
  if (!options.apply) {
    return { status: "dry_run", host: target.host, database: target.database, adminRole: target.user, sqlFile: SQL_FILE };
  }
  try {
    psql("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--host", target.host, "--port", target.port, "--username", target.user, "--dbname", target.database, "--file", SQL_FILE], {
      env: childEnvironment(target, env), stdio: "inherit", windowsHide: true, timeout: 120_000,
    });
  } catch {
    throw new Error("support_provisioning_failed; inspect the selected branch manually before retrying");
  }
  return { status: "provisioning_script_completed", host: target.host, database: target.database, role: "ornigami_support_reader", credentialDelivery: "set interactively in psql; publish through the approved private source" };
}

function main() {
  const result = provisionSupportAccess();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    const safe = new Set([
      "usage: node scripts/a12-support-access-provision.mjs --admin-env PRIVATE_FILE --expected-host HOST --expected-database DB [--apply]",
      "required_option_missing", "duplicate_option", "admin_credential_file_unavailable", "admin_credential_file_invalid",
      "admin_connection_invalid", "admin_target_identity_mismatch", "support_provisioning_failed; inspect the selected branch manually before retrying",
    ]);
    process.stderr.write(`${safe.has(error?.message) ? error.message : "support_provisioning_failed"}\n`);
    process.exitCode = 2;
  }
}
