# A12 support access operations

This package prepares the A12 read-only operator access requested for the existing local support inbox. It provides a fail-closed PostgreSQL role script, a guarded provisioning wrapper, and a verifier for effective database permissions and private local artifact access. It does not change shared application settings, routes, models, dependencies, deployment configuration, or the roadmap.

## Target and credential handling

Use only the isolated Neon branch for this task. Before provisioning, independently confirm the Neon project and branch in the Neon Console, then copy that branch's exact endpoint host and database name into the command below. The expected host/database arguments are checked against the admin connection loaded from a private file before any SQL is sent. Do not select the existing production parent, another project, or a branch that was not approved for this task.

The provisioning wrapper reads only `DATABASE_URL` from the specified private admin file. It passes host, database, and user as ordinary connection parameters; the password stays in the child process environment and never appears in command arguments or output. The wrapper defaults to dry run. The `--apply` flag executes [A12_SUPPORT_ACCESS.sql](./A12_SUPPORT_ACCESS.sql) through `psql`; the script creates the role without `LOGIN`, validates effective grants, commits only if the checks pass, then prompts twice for a password with psql's `\password` command. `LOGIN` is enabled only after that prompt succeeds. PostgreSQL documents that `\password` avoids cleartext passwords in command history and server logs ([psql password command](https://www.postgresql.org/docs/17/app-psql.html#APP-PSQL-META-COMMAND-PASSWORD)); the generated support URL must still be delivered through the approved private credential file outside this repository.

```powershell
node scripts/a12-support-access-provision.mjs `
  --admin-env 'C:\path\outside\repo\admin-branch.env' `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>'

# After checking the dry-run target and branch identity, run interactively:
node scripts/a12-support-access-provision.mjs `
  --admin-env 'C:\path\outside\repo\admin-branch.env' `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>' `
  --apply
```

The script aborts if `ornigami_support_reader` already exists, if `public.feedback` is missing, if PostgreSQL is older than 17, or if the new role would inherit access to other persistent tables, columns, or sequences, database/schema creation, executable non-system `SECURITY DEFINER` routines, row filtered feedback, feedback mutations, or grantable `SELECT`. It never revokes or repairs a shared `PUBLIC` grant. A failure after the SQL transaction commits but before the password prompt completes leaves the role `NOLOGIN`; inspect the branch before retrying.

PostgreSQL's default `PUBLIC` database `TEMP` privilege may remain available. That permits temporary objects for the credential holder; it grants no access to other persistent application tables. The connection query made by the verifier itself always runs in a read-only transaction. The verifier separately confirms there is no database `CREATE` privilege and no schema `CREATE` privilege. See [PostgreSQL privileges](https://www.postgresql.org/docs/17/ddl-priv.html) for the distinction between database `TEMP` and persistent object grants.

Once the support credential has been saved to the approved private Windows file outside the repository, verify it without printing the connection string:

```powershell
$env:SUPPORT_DATABASE_URL = '<load the value from the approved private credential file without echoing it>'
node scripts/a12-support-access-verify.mjs `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>' `
  --artifact '<absolute path to a support-inbox JSON artifact>'
```

The verifier refuses to connect unless the connection URL's host and database match the independently supplied expected values and its user is exactly `ornigami_support_reader`. It rejects URL overrides and requires TLS for network hosts. Its PostgreSQL read-only transaction proves session/current identity, required schema/table access, login role attributes, no role memberships (including `SET ROLE` paths), no other persistent table or column rights, no sequence rights, no feedback mutation/grant option, no schema/database `CREATE`, no callable non-system `SECURITY DEFINER` routine, and no feedback RLS filter. It then checks that the inbox artifact and containing directory are owner-only on POSIX or grant access only to the current Windows account. It emits the sanitized target, permission result, and artifact path; it never emits records or credentials.

The verifier requires a `psql` 17 client and an A12 support artifact already created by `scripts/support-inbox.mjs`. It is read-only. It does not query or change feedback rows. The inbox continues to use `SUPPORT_DATABASE_URL` only and writes user-submitted content to the private local artifact described in [A12 support visibility](./A12_SUPPORT_VISIBILITY.md).

## Sentry notification delivery

Historical recipient email delivery for the existing A12 controlled Sentry event has now been independently verified. The event-trigger and delivery evidence, with its privacy boundary, is recorded in [A12 Sentry notification evidence](./A12_SENTRY_NOTIFICATION_EVIDENCE.md). This access branch did not send a new Sentry event or change Sentry configuration.

## Evidence and handoff

- The disposable PostgreSQL 17 fixture runs the provisioning SQL transaction against synthetic tables and uses a real locally generated private artifact. Negative cases cover a second table, column-only `SELECT`, column `UPDATE`, sequence access, `MAINTAIN`, grantable `SELECT`, inherited role membership, wrong target identity, a broad Windows ACL, and a `PUBLIC` grant that causes the provision transaction to roll back.
- A read-only preflight against the separately approved isolated Neon child found `public.feedback`, no existing `ornigami_support_reader` collision, no feedback RLS, no `PUBLIC` access to other persistent tables/sequences, no non-system `SECURITY DEFINER` routines, and no `PUBLIC` database `CREATE` privilege. It read no feedback rows and performed no mutation.
- The reviewed SQL transaction created the dedicated role as `NOLOGIN` and its privilege checks passed on the isolated Neon child. Neon rejected the subsequent password/LOGIN alteration; the recovery left the role `NOLOGIN` and removed the candidate credential file. A support login, working credential, or inbox read against Neon is therefore not verified. Root/reviewer should inspect this Neon-specific activation constraint before choosing an approved role-password path.
- Historical Sentry recipient email receipt is independently verified as described above; no new notification was sent by this access package.

Validation command:

```powershell
node --experimental-strip-types --test tests/a12-support-access.test.mts
```
