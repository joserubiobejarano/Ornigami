# A12 support access operations

This package prepares the A12 read-only operator access requested for the existing local support inbox. It provides a fail-closed PostgreSQL role script, a guarded provisioning wrapper, and a verifier for effective database permissions and private local artifact access. It does not change shared application settings, routes, models, dependencies, deployment configuration, or the roadmap.

## Target and credential handling

Use only the isolated Neon branch for this task. Before provisioning, independently confirm the Neon project and branch in the Neon Console, then copy that branch's exact endpoint host and database name into the command below. The expected host/database arguments are checked against the admin connection loaded from a private file before any SQL is sent. Do not select the existing production parent, another project, or a branch that was not approved for this task.

The provisioning wrapper reads only `DATABASE_URL` from the specified private admin file. It passes host, database, and user as connection parameters; the admin password stays in the child process environment and never appears in arguments or output. The wrapper defaults to dry run. `--apply` executes [A12_SUPPORT_ACCESS.sql](./A12_SUPPORT_ACCESS.sql); that SQL creates the role without `LOGIN`, validates effective grants, then commits. `--activate` handles an already-created `NOLOGIN` role after independently auditing its attributes, memberships and effective privileges. Both mutating modes require a new `--support-env` path in a pre-existing private directory outside the repository. The wrapper creates a random credential in that file with exclusive-create semantics and checks the file and directory ACL before activation.

Neon requires a plaintext password in the SQL protocol and does not accept client-generated password hashes ([Neon roles documentation](https://github.com/neondatabase/website/blob/main/content/docs/manage/roles.md)). Therefore the wrapper sends the high-entropy generated password only over the required TLS connection, through `psql` stdin in a transaction; it never writes SQL/password material to a file or command arguments and never prints the secret. Neon must receive plaintext to set the password, so this workflow does not claim the provider cannot observe it. If activation fails, the wrapper confirms `NOLOGIN` before deleting the candidate file; if status is uncertain, it preserves the owner-only file and reports that state for manual inspection.

```powershell
node scripts/a12-support-access-provision.mjs `
  --admin-env 'C:\path\outside\repo\admin-branch.env' `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>'

# After checking the dry-run target and branch identity, run on a new role:
node scripts/a12-support-access-provision.mjs `
  --admin-env 'C:\path\outside\repo\admin-branch.env' `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>' `
  --support-env 'C:\path\inside\private-folder\support.env' `
  --apply

# Or activate only a previously prepared, audited NOLOGIN role:
node scripts/a12-support-access-provision.mjs `
  --admin-env 'C:\path\outside\repo\admin-branch.env' `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>' `
  --support-env 'C:\path\inside\private-folder\support.env' `
  --activate
```

`--apply` aborts if `ornigami_support_reader` already exists or if `public.feedback` is missing, PostgreSQL is older than 17, or the new role would inherit access to other persistent tables, columns, or sequences, database/schema creation, executable non-system `SECURITY DEFINER` routines, row-filtered feedback, feedback mutations, or grantable `SELECT`. `--activate` requires that exact role to already exist as `NOLOGIN` with all approved flags and privileges, and independently checks the same effective-access invariants before setting a password or enabling login. Neither mode revokes or repairs a shared `PUBLIC` grant. A failure during role creation rolls its transaction back. A failure during activation is followed by an explicit login-state check; the wrapper deletes its candidate file only when `NOLOGIN` has been confirmed. If provider/network state prevents that proof, keep the private file secure and inspect the branch before retrying.

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

- The disposable PostgreSQL 17 fixture runs the provisioning SQL transaction against synthetic tables, sets a synthetic password and enables login, then exercises the independent verifier with a locally generated private artifact. Negative cases cover a second table, column-only `SELECT`, column `UPDATE`, sequence access, `MAINTAIN`, grantable `SELECT`, inherited role membership, wrong target identity, broad artifact ACLs, and a `PUBLIC` grant that causes the provision transaction to roll back. Wrapper tests cover dry run, target and worktree path rejection, role audit, password delivery through stdin only, and definite versus ambiguous activation failures.
- A read-only preflight against the separately approved isolated Neon child found `public.feedback`, no existing `ornigami_support_reader` collision, no feedback RLS, no `PUBLIC` access to other persistent tables/sequences, no non-system `SECURITY DEFINER` routines, and no `PUBLIC` database `CREATE` privilege. It read no feedback rows and performed no mutation.
- On 2026-10-04, the reviewed wrapper activated `ornigami_support_reader` on the approved Neon child `br-noisy-shape-aly2lr5p` only. The independent verifier confirmed the exact host/database/user identity, `LOGIN`, feedback `SELECT`, no other persistent table access, no memberships, and a current-user-only credential artifact ACL. The existing inbox completed with zero records and produced a current-user-only artifact at `2026-10-04T12:01:45.742Z`. A read-only `SELECT` on `public.users` was denied. No row contents were printed; the production parent was not touched. The temporary private admin source was removed after the verifier receipt was accepted; the support credential and private Sentry evidence source remain in their approved local private folder.
- An earlier attempt with client-generated password hashes failed because Neon rejects pre-hashed passwords (see the Neon role documentation). The current tool handles Neon through plaintext passed over required TLS via stdin, using a generated password retained only in the approved private `support.env` file. No provider log secrecy is asserted.
- Historical Sentry recipient email receipt is independently verified as described above; no new notification was sent by this access package.

Validation command:

```powershell
node --experimental-strip-types --test tests/a12-support-access.test.mts
```

Runtime requirements: Node.js with built-in `node:crypto` and a PostgreSQL 17 `psql` client; no application dependencies were added. Disposable integration tests require local PostgreSQL 17 server binaries (`initdb`, `pg_ctl`, `psql`).
