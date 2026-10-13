# Planned VPS privacy and backup verification

Owner-confirmed target on 13 October 2026: **Contabo, US East**, with VPS + Coolify intended as final hosting in November 2026. The VPS is not yet available for inspection. This is a plan, not proof of an ordered service, company contract, server region, configured backups or migration. No purchase is authorized here; all additional services remain on Free. Netlify signup is on hold.

## Company agreement and target

When access exists, inspect the actual order and customer identity, seller entity, server identifier/region, service plan, administrative access and recovery ownership. Keep identifiers and receipts private. Review the generated agreement before requesting specific acceptance authorization.

Contabo's [DPA workflow](https://docs.contabo.com/docs/dpa/dpa/) generates a service-specific agreement in the Customer Control Panel: confirm the legal customer, selected services, data/person categories, review the preview and conclude it before downloading the PDF. No Ornigami agreement has been generated or accepted. Review its actual transfer, subprocessor and residual-copy provisions; US East does not establish the location of every support or backup copy.

## Backup classes to verify separately

| Class | Evidence needed on the actual target |
| --- | --- |
| Application database | Engine/resource and included databases, enabled schedule/timezone, execution results, location, oldest copy, local and remote retention limits, encryption/access ownership |
| Application volumes/files | Separate coverage for uploads and other persistent volumes; database backups alone do not establish it |
| Coolify control plane | Instance-backup scope, schedule, destinations and retention; private recovery-key custody outside the server, without exposing the key |
| VPS/provider copies | Actual enabled snapshots/add-ons, retention triggers, deletion/cancellation handling and residual-copy limits |
| Existing exports/archives | Continue the existing inventory until migration and permitted cleanup are evidenced; migration does not erase source copies |

[Coolify database backups](https://coolify.io/docs/databases/backups) can create local files and optional S3 copies. Each retention limit operates independently; **zero means unlimited**, not immediate deletion. Capture actual values, timezone, failed/partial executions and destinations. A successful file is not a restore test. No schedule or storage provider has been selected or activated.

[Coolify instance backups](https://coolify.io/docs/core/backup-and-recovery/instance-backup) cover its control-plane database, not application data or volumes. Local/S3 limits are separate; upload failures can leave a local copy. Record private key custody separately from backup contents. Do not publish keys, environment values or database records in Git.

Contabo's [VPS Auto Backup documentation](https://docs.contabo.com/docs/servers-hosting/vps-auto-backup/) describes a **paid add-on** with daily copies and up to ten backups; disabled-service handling differs from ordinary rotation. Do not activate it under the Free-only instruction. Its published periods are not evidence of an enabled Ornigami backup or a 35-day application rotation.

## Review and restore evidence

Prepare a disposable restore with production sending, billing, schedules and intake isolated. Verify recoverability and reapply post-backup rights outcomes, suppression, restrictions, usage history and holds using the [retention reconciliation procedure](./PRIVACY_RETENTION_INVENTORY.md#restore-and-erasure-reconciliation). Preserve scoped execution and expiry evidence privately. No restore, deployment, cleanup or migration was performed.

Closure requires the actual company agreement, enabled data classes, destinations and expiry evidence. No dashboard exists yet; provider-wide public guidance cannot close those account-specific checks.
