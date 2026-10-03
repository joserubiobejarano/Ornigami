# A12 support visibility handoff

Status: isolated implementation proposal for integration review. This worktree adds a read-only local operator inbox for existing `public.feedback` records, accurate contact-form copy, and sanitized feedback-route error logging. It does not update the shared roadmap, shared auth/schema/settings/deployment configuration, or contact/email delivery. No live support records were queried and no messages were sent.

## Operator workflow

The inbox uses `scripts/support-inbox.mjs`. It requires `SUPPORT_DATABASE_URL`, a PostgreSQL credential provisioned for operator review. The command deliberately does not fall back to the app's `DATABASE_URL`.

```powershell
# Set this from the approved operator secret source; do not paste the value into a ticket or shell transcript.
$env:SUPPORT_DATABASE_URL = '<operator credential from approved secret source>'
node scripts/support-inbox.mjs --limit 25
```

Before opening the artifact, check the emitted source host and database against the intended review target. Standard output contains only the row count, whether another page exists, the sanitized source target, and the private artifact path. The JSON artifact includes the submitted message, category, URL, and timestamp. Contact name/email are currently embedded in the submitted message by the existing form. It excludes request browser metadata and account identifiers. Messages and selected fields are bounded; any truncation is marked per field.

Artifacts are written under the user's local application/state directory in a unique per-run folder. Windows output disables ACL inheritance and verifies that the current user is the only explicit access rule; POSIX output uses directory mode `0700` and file mode `0600`. The artifact is plaintext and contains user-submitted content: open it only on a trusted operator device and remove it when review is complete. No record content, database URL, exception, or secret is printed. The CLI does not acknowledge, change, or delete feedback rows and never sends email.

For a next page, copy `nextCursor` from the private artifact and run:

```powershell
node scripts/support-inbox.mjs --limit 25 --cursor '<nextCursor value>'
```

Pages use a stable `(created_at, id)` descending keyset with database microsecond precision; each query fetches at most 101 rows and uses a read-only transaction with an eight-second statement timeout and ten-second request timeout. There is no automatic poll or cron. Contact success copy now confirms persistence for review and does not promise an email reply.

## Integration requirements and open decisions

- Provision an operator database login/role whose access is limited to `SELECT` on `public.feedback` (for an existing role, the required table grant is `GRANT SELECT ON TABLE public.feedback TO ornigami_support_reader;`), and publish its connection value to operators through the approved secret mechanism as `SUPPORT_DATABASE_URL`. This shared credential grant/secret provisioning is an integration dependency; this patch adds no environment schema or deployment setting.
- Verify the expected host/database emitted by the command before reviewing each target. A credential can point to any database; the CLI cannot infer which environment is intended.
- The inbox is read-only and has no acknowledgement/status field, web route, admin role, or durable assignment workflow. If team members need those capabilities, integration must define the access contract and shared model/schema first.
- Decide whether support follow-up email should be sent manually or later through an explicitly approved mail/outbox workflow. No email notification is implemented or claimed.
- Establish operational artifact deletion expectations for the team's devices. The CLI's private local files are separate from the existing 365-day `public.feedback` retention policy.

## Validation

On Node 22.23.3, `node --experimental-strip-types --test tests/a12-support-visibility.test.mts` passed 5/5 tests. Coverage includes actual Neon HTTP SQL compilation through a mocked fetch response, exact microsecond cursor paging, parameter binding, bounded/read-only query options, target credential redaction, real Windows ACL application/verification on a synthetic artifact under `.next`, POSIX mode assertions, and feedback POST rate-limit/error-log behavior with mocks. No database or provider was contacted. Targeted ESLint passed for all support route, contact UI, CLI, and test files. The combined `tsc --noEmit` check passed. Full ESLint reported zero errors and four pre-existing warnings; see the [combined A12 handoff](./A12_ERROR_SUPPORT_HANDOFF.md) for shared validation and evidence status.
