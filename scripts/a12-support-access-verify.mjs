import { execFileSync } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const SUPPORT_ROLE = "ornigami_support_reader";

export function parseArgs(args) {
  const values = Object.create(null);
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (!["--expected-host", "--expected-database", "--artifact"].includes(key) || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("usage: node scripts/a12-support-access-verify.mjs --expected-host HOST --expected-database DB --artifact PATH");
    }
    if (values[key]) throw new Error("duplicate_option");
    values[key] = args[i + 1];
    i += 1;
  }
  if (!values["--expected-host"] || !values["--expected-database"] || !values["--artifact"]) throw new Error("required_option_missing");
  return { expectedHost: values["--expected-host"].toLowerCase(), expectedDatabase: values["--expected-database"], artifact: resolve(values["--artifact"]) };
}

export function parseSupportTarget(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error("support_connection_invalid"); }
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.hostname || !url.username || !url.password || !url.pathname.slice(1)) {
    throw new Error("support_connection_invalid");
  }
  const allowedParams = new Set(["sslmode", "channel_binding"]);
  for (const key of new Set(url.searchParams.keys())) {
    if (!allowedParams.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error("support_connection_invalid");
  }
  const sslmode = url.searchParams.get("sslmode") || "require";
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase());
  if (!["require", "verify-ca", "verify-full"].includes(sslmode) && !(sslmode === "disable" && localHost)) throw new Error("support_connection_invalid");
  const channelBinding = url.searchParams.get("channel_binding");
  if (channelBinding && !["require", "prefer", "disable"].includes(channelBinding)) throw new Error("support_connection_invalid");
  return {
    host: url.hostname.toLowerCase(),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: url.port || "5432",
    sslmode,
    channelBinding,
  };
}

export function buildPermissionProbeSql() {
  return `BEGIN READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '2s';
SELECT pg_catalog.json_build_object(
  'sessionUser', session_user,
  'currentUser', current_user,
  'database', current_database(),
  'serverVersion', current_setting('server_version_num')::integer,
  'readOnlyTransaction', current_setting('transaction_read_only') = 'on',
  'superuser', role.rolsuper,
  'createRole', role.rolcreaterole,
  'createDatabase', role.rolcreatedb,
  'replication', role.rolreplication,
  'bypassRls', role.rolbypassrls,
  'inherit', role.rolinherit,
  'memberships', (SELECT count(*) FROM pg_catalog.pg_auth_members AS membership WHERE membership.member = role.oid),
  'feedbackSelect', pg_catalog.has_table_privilege(session_user, 'public.feedback', 'SELECT'),
  'publicSchemaUsage', pg_catalog.has_schema_privilege(session_user, 'public', 'USAGE'),
  'feedbackHasMutation', pg_catalog.has_table_privilege(session_user, 'public.feedback', 'INSERT')
    OR pg_catalog.has_table_privilege(session_user, 'public.feedback', 'UPDATE')
    OR pg_catalog.has_table_privilege(session_user, 'public.feedback', 'DELETE')
    OR pg_catalog.has_table_privilege(session_user, 'public.feedback', 'TRUNCATE')
    OR pg_catalog.has_table_privilege(session_user, 'public.feedback', 'REFERENCES')
    OR pg_catalog.has_table_privilege(session_user, 'public.feedback', 'TRIGGER')
    OR pg_catalog.has_table_privilege(session_user, 'public.feedback', 'MAINTAIN'),
  'feedbackColumnMutation', EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS column_info
    WHERE column_info.attrelid = pg_catalog.to_regclass('public.feedback')
      AND column_info.attnum > 0 AND NOT column_info.attisdropped
      AND (
        pg_catalog.has_column_privilege(session_user, column_info.attrelid, column_info.attnum, 'INSERT')
        OR pg_catalog.has_column_privilege(session_user, column_info.attrelid, column_info.attnum, 'UPDATE')
        OR pg_catalog.has_column_privilege(session_user, column_info.attrelid, column_info.attnum, 'REFERENCES')
      )
  ),
  'feedbackRowSecurity', (SELECT relation.relrowsecurity OR relation.relforcerowsecurity FROM pg_catalog.pg_class AS relation WHERE relation.oid = pg_catalog.to_regclass('public.feedback')),
  'otherTableAccess', EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%'
      AND schema.nspname NOT LIKE 'pg_temp_%'
      AND relation.oid <> pg_catalog.to_regclass('public.feedback')
      AND (
        pg_catalog.has_table_privilege(session_user, relation.oid, 'SELECT')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'INSERT')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'UPDATE')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'DELETE')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'TRUNCATE')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'REFERENCES')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'TRIGGER')
        OR pg_catalog.has_table_privilege(session_user, relation.oid, 'MAINTAIN')
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute AS column_info
          WHERE column_info.attrelid = relation.oid AND column_info.attnum > 0 AND NOT column_info.attisdropped
            AND (
              pg_catalog.has_column_privilege(session_user, relation.oid, column_info.attnum, 'SELECT')
              OR pg_catalog.has_column_privilege(session_user, relation.oid, column_info.attnum, 'INSERT')
              OR pg_catalog.has_column_privilege(session_user, relation.oid, column_info.attnum, 'UPDATE')
              OR pg_catalog.has_column_privilege(session_user, relation.oid, column_info.attnum, 'REFERENCES')
            )
        )
      )
  ),
  'otherSequenceAccess', EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS sequence
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = sequence.relnamespace
    WHERE sequence.relkind = 'S' AND schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%'
      AND schema.nspname NOT LIKE 'pg_temp_%'
      AND (
        pg_catalog.has_sequence_privilege(session_user, sequence.oid, 'USAGE')
        OR pg_catalog.has_sequence_privilege(session_user, sequence.oid, 'SELECT')
        OR pg_catalog.has_sequence_privilege(session_user, sequence.oid, 'UPDATE')
      )
  ),
  'databaseCreate', pg_catalog.has_database_privilege(session_user, current_database(), 'CREATE'),
  'databaseTemp', pg_catalog.has_database_privilege(session_user, current_database(), 'TEMP'),
  'schemaCreate', EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace AS schema
    WHERE schema.nspname NOT IN ('pg_catalog', 'information_schema') AND schema.nspname NOT LIKE 'pg_toast%'
      AND schema.nspname NOT LIKE 'pg_temp_%'
      AND pg_catalog.has_schema_privilege(session_user, schema.oid, 'CREATE')
  ),
  'securityDefinerExecute', EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS schema ON schema.oid = routine.pronamespace
    WHERE routine.prosecdef AND schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND schema.nspname NOT LIKE 'pg_toast%' AND schema.nspname NOT LIKE 'pg_temp_%'
      AND pg_catalog.has_function_privilege(session_user, routine.oid, 'EXECUTE')
  ),
  'feedbackSelectGrantable', pg_catalog.has_table_privilege(session_user, 'public.feedback', 'SELECT WITH GRANT OPTION')
) FROM pg_catalog.pg_roles AS role WHERE role.rolname = session_user;
ROLLBACK;`;
}

function psqlEnvironment(target, baseEnv) {
  const env = Object.create(null);
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "PATHEXT", "ComSpec", "TEMP", "TMP"]) if (baseEnv[key]) env[key] = baseEnv[key];
  Object.assign(env, { PGHOST: target.host, PGPORT: target.port, PGUSER: target.user, PGPASSWORD: target.password, PGDATABASE: target.database, PGSSLMODE: target.sslmode });
  if (target.channelBinding) env.PGCHANNELBINDING = target.channelBinding;
  return env;
}

async function checkPrivateArtifact(path, { platform = process.platform, uid = process.getuid?.(), execFile = execFileSync } = {}) {
  const file = resolve(path);
  const [fileStat, directoryStat] = await Promise.all([lstat(file), lstat(dirname(file))]);
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || !directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("artifact_path_invalid");
  if (platform !== "win32") {
    if (uid === undefined || fileStat.uid !== uid || directoryStat.uid !== uid || (fileStat.mode & 0o077) !== 0 || (directoryStat.mode & 0o077) !== 0) {
      throw new Error("artifact_access_not_private");
    }
    return { status: "private_artifact_verified", artifact: await realpath(file), access: "owner_only" };
  }
  try {
    const whoami = execFile("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
    const identity = /^\s*"([^"]+)"\s*,\s*"(S-1-[0-9-]+)"\s*$/.exec(whoami);
    if (!identity) throw new Error();
    const account = identity[1].toLocaleLowerCase("en-US");
    for (const targetPath of [dirname(file), file]) {
      const acl = execFile("icacls.exe", [targetPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      const grants = acl.replace(targetPath, "").split(/\r?\n/).filter((line) => /:\([^)]*\)/.test(line) && !/\(DENY\)/i.test(line));
      const expectedIdentity = grants.every((line) => line.trim().split(/:\(/, 1)[0].trim().toLocaleLowerCase("en-US") === account);
      const fullControl = grants.length > 0 && grants.every((line) => /\(F\)/.test(line));
      const directoryMustBeExplicit = targetPath !== dirname(file) || grants.every((line) => !/\(I\)/.test(line));
      if (!expectedIdentity || !fullControl || !directoryMustBeExplicit) throw new Error();
    }
    return { status: "private_artifact_verified", artifact: await realpath(file), access: "current_user_only" };
  } catch { throw new Error("artifact_access_not_private"); }
}

export async function verifySupportAccess({ args = process.argv.slice(2), env = process.env, platform = process.platform, psql = execFileSync } = {}) {
  const options = parseArgs(args);
  const connectionString = env.SUPPORT_DATABASE_URL;
  if (!connectionString) throw new Error("SUPPORT_DATABASE_URL is required");
  const target = parseSupportTarget(connectionString);
  if (target.host !== options.expectedHost || target.database !== options.expectedDatabase || target.user !== SUPPORT_ROLE) {
    throw new Error("support_target_identity_mismatch");
  }
  let raw;
  try {
    raw = psql("psql", ["--no-psqlrc", "--no-align", "--tuples-only", "--quiet", "--set", "ON_ERROR_STOP=1"], {
      env: psqlEnvironment(target, env), input: buildPermissionProbeSql(), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024,
    }).trim();
  } catch { throw new Error("support_database_probe_failed"); }
  let proof;
  try { proof = JSON.parse(raw); } catch { throw new Error("support_database_probe_invalid"); }
  const valid = proof.sessionUser === SUPPORT_ROLE && proof.currentUser === SUPPORT_ROLE &&
    proof.database === options.expectedDatabase && Number(proof.serverVersion) >= 170000 && proof.readOnlyTransaction === true &&
    proof.superuser === false && proof.createRole === false && proof.createDatabase === false &&
    proof.replication === false && proof.bypassRls === false && proof.inherit === false &&
    Number(proof.memberships) === 0 && proof.publicSchemaUsage === true && proof.feedbackSelect === true && proof.feedbackHasMutation === false &&
    proof.feedbackColumnMutation === false && proof.feedbackRowSecurity === false &&
    proof.otherTableAccess === false && proof.otherSequenceAccess === false && proof.databaseCreate === false &&
    proof.schemaCreate === false && proof.securityDefinerExecute === false && proof.feedbackSelectGrantable === false;
  if (!valid) throw new Error("support_permissions_out_of_scope");
  const artifact = await checkPrivateArtifact(options.artifact, { platform });
  return {
    status: "support_access_verified",
    database: { host: target.host, database: proof.database, role: proof.sessionUser, selectFeedback: true, otherTableAccess: false, inheritedMemberships: 0, readOnlyTransaction: true, temporaryObjectPrivilege: proof.databaseTemp === true },
    artifact,
  };
}

async function main() {
  const result = await verifySupportAccess();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const safe = new Set(["required_option_missing", "duplicate_option", "usage: node scripts/a12-support-access-verify.mjs --expected-host HOST --expected-database DB --artifact PATH", "support_connection_invalid", "support_target_identity_mismatch", "SUPPORT_DATABASE_URL is required", "support_database_probe_failed", "support_database_probe_invalid", "support_permissions_out_of_scope", "artifact_path_invalid", "artifact_access_not_private"]);
    process.stderr.write(`${safe.has(error?.message) ? error.message : "support_access_verification_failed"}\n`);
    process.exitCode = 2;
  });
}
