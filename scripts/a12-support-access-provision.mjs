import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, parse, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPrivateArtifact, parseSupportTarget, psqlEnvironment } from "./a12-support-access-verify.mjs";

const SQL_FILE = fileURLToPath(new URL("../docs/tasks/A12_SUPPORT_ACCESS.sql", import.meta.url));
const ROLE = "ornigami_support_reader";

export function parseProvisionArgs(args) {
  const options = { mode: null, adminEnv: null, expectedHost: null, expectedDatabase: null, supportEnv: null };
  const names = new Map([["--admin-env", "adminEnv"], ["--expected-host", "expectedHost"], ["--expected-database", "expectedDatabase"], ["--support-env", "supportEnv"]]);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (["--apply", "--activate"].includes(value)) {
      if (options.mode) throw new Error("duplicate_mode");
      options.mode = value.slice(2);
      continue;
    }
    if (!names.has(value) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("usage: node scripts/a12-support-access-provision.mjs --admin-env PRIVATE_FILE --expected-host HOST --expected-database DB [--support-env PRIVATE_FILE] [--apply|--activate]");
    const name = names.get(value);
    if (options[name]) throw new Error("duplicate_option");
    options[name] = args[index + 1];
    index += 1;
  }
  if (!options.adminEnv || !options.expectedHost || !options.expectedDatabase || (options.mode && !options.supportEnv)) throw new Error("required_option_missing");
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
  if (target.host !== expectedHost || target.database !== expectedDatabase || target.user === ROLE) throw new Error("admin_target_identity_mismatch");
  return target;
}

function childEnvironment(target, sourceEnv) {
  const env = psqlEnvironment(target, sourceEnv);
  env.PGCONNECT_TIMEOUT = "10";
  return env;
}

function psqlArgs(target, env, extra = []) {
  return ["--no-psqlrc", "--no-align", "--tuples-only", "--quiet", "--set", "ON_ERROR_STOP=1", "--host", target.host, "--port", target.port, "--username", target.user, "--dbname", target.database, ...extra];
}

export function buildRoleAuditSql() {
  // Kept in sync with verify.mjs's probe; all rights are checked effectively,
  // including grants inherited from PUBLIC. Only the exact fixed role is named.
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s';
SELECT json_build_object(
  'roleExists', r.oid IS NOT NULL, 'login', r.rolcanlogin, 'superuser', r.rolsuper,
  'createRole', r.rolcreaterole, 'createDatabase', r.rolcreatedb, 'replication', r.rolreplication,
  'bypassRls', r.rolbypassrls, 'inherit', r.rolinherit,
  'memberships', (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid),
  'publicSchemaUsage', has_schema_privilege('ornigami_support_reader','public','USAGE'),
  'feedbackSelect', has_table_privilege('ornigami_support_reader','public.feedback','SELECT'),
  'feedbackSelectGrantable', has_table_privilege('ornigami_support_reader','public.feedback','SELECT WITH GRANT OPTION'),
  'feedbackMutation', has_table_privilege('ornigami_support_reader','public.feedback','INSERT') OR has_table_privilege('ornigami_support_reader','public.feedback','UPDATE') OR has_table_privilege('ornigami_support_reader','public.feedback','DELETE') OR has_table_privilege('ornigami_support_reader','public.feedback','TRUNCATE') OR has_table_privilege('ornigami_support_reader','public.feedback','REFERENCES') OR has_table_privilege('ornigami_support_reader','public.feedback','TRIGGER') OR has_table_privilege('ornigami_support_reader','public.feedback','MAINTAIN'),
  'feedbackColumnMutation', EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass('public.feedback') AND a.attnum>0 AND NOT a.attisdropped AND (has_column_privilege('ornigami_support_reader',a.attrelid,a.attnum,'INSERT') OR has_column_privilege('ornigami_support_reader',a.attrelid,a.attnum,'UPDATE') OR has_column_privilege('ornigami_support_reader',a.attrelid,a.attnum,'REFERENCES'))),
  'feedbackRls', (SELECT relrowsecurity OR relforcerowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.feedback')),
  'otherTableAccess', EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND c.oid<>pg_catalog.to_regclass('public.feedback') AND (has_table_privilege('ornigami_support_reader',c.oid,'SELECT') OR has_table_privilege('ornigami_support_reader',c.oid,'INSERT') OR has_table_privilege('ornigami_support_reader',c.oid,'UPDATE') OR has_table_privilege('ornigami_support_reader',c.oid,'DELETE') OR has_table_privilege('ornigami_support_reader',c.oid,'TRUNCATE') OR has_table_privilege('ornigami_support_reader',c.oid,'REFERENCES') OR has_table_privilege('ornigami_support_reader',c.oid,'TRIGGER') OR has_table_privilege('ornigami_support_reader',c.oid,'MAINTAIN') OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND (has_column_privilege('ornigami_support_reader',c.oid,a.attnum,'SELECT') OR has_column_privilege('ornigami_support_reader',c.oid,a.attnum,'INSERT') OR has_column_privilege('ornigami_support_reader',c.oid,a.attnum,'UPDATE') OR has_column_privilege('ornigami_support_reader',c.oid,a.attnum,'REFERENCES'))))),
  'otherSequenceAccess', EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND (has_sequence_privilege('ornigami_support_reader',c.oid,'USAGE') OR has_sequence_privilege('ornigami_support_reader',c.oid,'SELECT') OR has_sequence_privilege('ornigami_support_reader',c.oid,'UPDATE'))),
  'databaseCreate', has_database_privilege('ornigami_support_reader',current_database(),'CREATE'),
  'databaseConnect', has_database_privilege('ornigami_support_reader',current_database(),'CONNECT'),
  'schemaCreate', EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND has_schema_privilege('ornigami_support_reader',n.oid,'CREATE')),
  'securityDefinerExecute', EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND has_function_privilege('ornigami_support_reader',p.oid,'EXECUTE'))
) FROM (SELECT * FROM pg_catalog.pg_roles WHERE rolname='ornigami_support_reader') r;
ROLLBACK;`;
}

function auditIsSafe(proof) {
  return proof?.roleExists === true && proof.login === false && proof.superuser === false && proof.createRole === false &&
    proof.createDatabase === false && proof.replication === false && proof.bypassRls === false && proof.inherit === false &&
    Number(proof.memberships) === 0 && proof.publicSchemaUsage === true && proof.feedbackSelect === true &&
    proof.feedbackSelectGrantable === false && proof.feedbackMutation === false && proof.feedbackColumnMutation === false &&
    proof.feedbackRls === false && proof.otherTableAccess === false && proof.otherSequenceAccess === false &&
    proof.databaseCreate === false && proof.databaseConnect === true && proof.schemaCreate === false && proof.securityDefinerExecute === false;
}

function parseProof(stdout) {
  try { return JSON.parse(stdout.trim()); } catch { throw new Error("support_role_audit_failed"); }
}

function makeSupportUrl(target, secret) {
  return `postgresql://${encodeURIComponent(ROLE)}:${secret}@${target.host}:${target.port}/${encodeURIComponent(target.database)}?sslmode=${target.sslmode}${target.channelBinding ? `&channel_binding=${target.channelBinding}` : ""}`;
}

async function assertPrivateDestination(file, platform) {
  const lexicalParent = dirname(resolve(file));
  let parent;
  try { parent = realpathSync(lexicalParent); } catch { throw new Error("support_credential_destination_invalid"); }
  if (parent !== lexicalParent) throw new Error("support_credential_destination_invalid");
  let current = parent;
  while (true) {
    try { lstatSync(join(current, ".git")); throw new Error("support_credential_destination_invalid"); }
    catch (error) {
      if (error?.message === "support_credential_destination_invalid") throw error;
      if (error?.code !== "ENOENT") throw new Error("support_credential_destination_invalid");
    }
    if (current === parse(current).root) break;
    current = dirname(current);
  }
  const marker = join(parent, `.a12-access-check-${randomBytes(8).toString("hex")}`);
  let fd;
  try {
    fd = openSync(marker, "wx", 0o600);
    closeSync(fd);
    fd = undefined;
    await checkPrivateArtifact(marker, { platform });
  } catch { throw new Error("support_credential_destination_invalid"); }
  finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* already closed */ }
    try { unlinkSync(marker); } catch { /* no credential was written */ }
  }
}

function createCredentialFile(file, target, secret) {
  const output = resolve(file);
  const parent = dirname(output);
  let created = false;
  try {
    const parentStat = lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error();
    if (realpathSync(parent) !== parent || existsSync(output)) throw new Error();
    const fd = openSync(output, "wx", 0o600);
    created = true;
    try { writeFileSync(fd, `SUPPORT_DATABASE_URL=${makeSupportUrl(target, secret)}\n`, { encoding: "utf8" }); } finally { closeSync(fd); }
  } catch {
    if (created) try { unlinkSync(output); } catch { /* partial secret file remains private; surfaced as failure */ }
    throw new Error("support_credential_destination_invalid");
  }
  return output;
}

function safePsql(psql, target, env, sql) {
  try {
    return psql("psql", psqlArgs(target, env), { env, input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 });
  } catch { throw new Error("support_database_operation_failed"); }
}

function removeCredential(file) { try { unlinkSync(file); return true; } catch { return false; } }

export async function provisionSupportAccess({ args = process.argv.slice(2), env = process.env, psql = execFileSync, platform = process.platform } = {}) {
  const options = parseProvisionArgs(args);
  const target = readAdminConnection(options.adminEnv, options.expectedHost, options.expectedDatabase);
  if (!options.mode) return { status: "dry_run", host: target.host, database: target.database, adminRole: target.user, sqlFile: SQL_FILE };
  if (!options.supportEnv) throw new Error("required_option_missing");
  if (existsSync(resolve(options.supportEnv))) throw new Error("support_credential_destination_exists");
  await assertPrivateDestination(options.supportEnv, platform);
  const childEnv = childEnvironment(target, env);
  if (options.mode === "apply") safePsql(psql, target, childEnv, readFileSync(SQL_FILE, "utf8"));

  let audit;
  try { audit = parseProof(safePsql(psql, target, childEnv, buildRoleAuditSql())); } catch { throw new Error("support_role_audit_failed"); }
  if (!auditIsSafe(audit)) throw new Error("support_role_not_safe_to_activate");

  if (existsSync(resolve(options.supportEnv))) throw new Error("support_credential_destination_exists");
  const secret = randomBytes(32).toString("base64url");
  const credentialFile = createCredentialFile(options.supportEnv, target, secret);
  try {
    // Verify the actual file and inherited directory ACL before making the
    // password usable. The destination must already be a private local folder.
    const credentialAccess = (await checkPrivateArtifact(credentialFile, { platform })).access;
    if (realpathSync(dirname(credentialFile)) !== dirname(credentialFile)) throw new Error("support_credential_destination_invalid");
    // Neon accepts plaintext PASSWORD and rejects client-generated verifier hashes.
    // This high-entropy URL-safe value is sent only over the required TLS connection
    // via stdin; it is never placed in argv, a SQL file, stdout, or stderr.
    safePsql(psql, target, childEnv, `BEGIN; SET LOCAL statement_timeout='8s'; ALTER ROLE ${ROLE} PASSWORD '${secret}'; ALTER ROLE ${ROLE} LOGIN; COMMIT;`);
    return { status: "support_login_activated", host: target.host, database: target.database, role: ROLE, credentialFile, credentialAccess };
  } catch {
    // A lost connection can happen after COMMIT, so do not delete the only
    // credential until NOLOGIN is positively established.
    let noLoginConfirmed = false;
    try {
      const status = parseProof(safePsql(psql, target, childEnv, `BEGIN READ ONLY; SELECT json_build_object('login',rolcanlogin) FROM pg_catalog.pg_roles WHERE rolname='${ROLE}'; ROLLBACK;`));
      if (status.login === true) safePsql(psql, target, childEnv, `ALTER ROLE ${ROLE} NOLOGIN;`);
      const confirmed = parseProof(safePsql(psql, target, childEnv, `BEGIN READ ONLY; SELECT json_build_object('login',rolcanlogin) FROM pg_catalog.pg_roles WHERE rolname='${ROLE}'; ROLLBACK;`));
      noLoginConfirmed = confirmed.login === false;
      if (noLoginConfirmed) removeCredential(credentialFile);
    } catch { /* Keep the private candidate file if the login state cannot be proved. */ }
    throw new Error(noLoginConfirmed
      ? "support_activation_failed; role is confirmed NOLOGIN; inspect the private credential destination before retrying"
      : "support_activation_unknown; inspect the selected branch and private credential file before retrying");
  }
}

async function main() {
  const result = await provisionSupportAccess();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const safe = new Set(["required_option_missing", "duplicate_option", "duplicate_mode", "usage: node scripts/a12-support-access-provision.mjs --admin-env PRIVATE_FILE --expected-host HOST --expected-database DB [--support-env PRIVATE_FILE] [--apply|--activate]", "admin_credential_file_unavailable", "admin_credential_file_invalid", "admin_connection_invalid", "admin_target_identity_mismatch", "support_credential_destination_invalid", "support_credential_destination_exists", "support_role_audit_failed", "support_role_not_safe_to_activate", "support_activation_failed; role is confirmed NOLOGIN; inspect the private credential destination before retrying", "support_activation_unknown; inspect the selected branch and private credential file before retrying", "support_database_operation_failed"]);
    process.stderr.write(`${safe.has(error?.message) ? error.message : "support_provisioning_failed"}\n`);
    process.exitCode = 2;
  });
}
