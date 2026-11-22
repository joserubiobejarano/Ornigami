# Owner decisions for an invite-only export beta — 22 November 2026

Status: **policy decisions received for preparing an invite-only, unpaid,
export-only beta. This is not customer-admission, purchase or deployment
authority.** Concrete storage destination, support address and hosting
selection remain pending. Existing documents are proposals unless recorded
below.

## Decisions received

The owner approved the following on 22 November 2026 for beta preparation only.

### 1. Backup and recovery

- Jose is backup custodian and recovery operator.
- Encrypted backup daily while the beta is active and before maintenance.
- Retain backup copies for 30 days.
- Keep backups off the application host.
- Keep the encryption secret in the owner's password manager, separately from
  backups. Use a temporary private file when the tool requires it; never commit
  it.
- Target a maximum 24-hour snapshot age; this is not a guaranteed recovery SLA.
- Admission stays closed when required journal/accounting evidence cannot be
  reconciled.
- **Pending:** exact off-host storage destination. Do not purchase or configure a
  service without explicit approval.

### 2. Retention and assisted deletion

- Assisted deletion/minimization only; no self-service deletion initially.
- Target 30 days for operational logs and expired/revoked credential material.
- Minimize identifying labels within 30 days after account closure.
- Retain closed support/rights-request records for 365 days.
- Review settled usage after 13 months for safe minimization/aggregation.
- These periods do not authorize deleting accounting evidence or restoring
  quota/spend capacity.
- Preserve reserved/unknown exposure until reconciled; review monthly.
- Keep deletion/replay evidence as long as any retained backup could resurrect
  affected data.
- No automatic purge until implementation and retention exceptions are reviewed.

### 3. Support

- Jose owns support and access administration.
- Use direct email to the owner; the actual address is pending before
  invitations.
- Best-effort acknowledgement within two business days.
- No 24/7 service or contractual SLA.
- No new mailbox, ticketing subscription or automated customer messaging is
  authorized.

### 4. Custom Next.js maintenance

- Jose is accountable interim maintainer for the initial beta, with
  engineering/agent assistance.
- Security updates require review and the documented requalification checks.
- Prepare a bounded retirement assessment for official Next.js while preserving
  CSP/SRI; do not start a framework rewrite yet.
- This is not acceptance of unresolved vulnerabilities.

### 5. Hosting and admission

- Intended topology: one Linux x86_64 host, one runtime/writer, local persistent
  storage and a private HTTPS edge.
- **Pending:** hosting provider, region, domain and spending limit.
- Initial pilot scope: one business, invite-only, operator-assisted, unpaid and
  export-only.
- Live paid providers, public self-service and campaign publishing remain off.
- Real customer admission requires verified recovery, implemented policy, the
  customer notice and explicit owner approval.
- No persistent deployment is authorized yet.

## Still pending before invitations/admission

- exact off-host backup destination and any purchase/configuration approval;
- support email address;
- hosting provider, region, domain and spending limit;
- final customer notice/privacy terms and explicit admission approval;
- owner-operated usability exercise (not yet executed).

## Supported engineering constraints (not policy choices)

## Supported engineering constraints (not policy choices)

The following are safety requirements already implemented and are not expanded
by owner acknowledgement:

- one host, one writer and a stopped-writer backup;
- encrypted archive with authenticated integrity and private key/store/output
  permissions;
- fresh-directory/volume restore with a closed restore gate;
- latest-authoritative minimization-journal replay;
- separate authoritative usage/settlement evidence before admission release;
- preserved reserved/unknown exposure and unchanged accounting relationships;
- no invented records, no capacity reset and no admission while evidence is
  missing or inconsistent;
- no-clobber publication and repeatable default-path replay.

The owner chooses the operational policy and destination; acknowledgement alone
does not substitute for evidence.

## Original request (historical)

The questions below are retained for context. The decisions received above
supersede the proposal text where they conflict.

## 1. Backup and recovery

Proposal on record: no destination, frequency, retention, key custodian or
recovery operator is defined in `BUILDER_CANDIDATE_DECISIONS_20261120.md` or the
backup mechanics record.

Decide:

- approved backup destination and storage owner;
- backup frequency and whether the writer must be stopped for every backup;
- retention count/period and deletion evidence;
- who holds the encryption passphrase/key, where it is stored and how it is
  rotated/recovered;
- who is authorized to perform restore, replay, reconciliation and admission
  reopening;
- whether the first beta uses the local encrypted tool only or a managed
  storage service;
- the acceptable data-loss window and whether admission stays closed when
  reserved/unknown usage cannot be reconciled.

## 2. Record retention and assisted deletion

Proposal on record: no scheduled cleanup or automatic expiry; deletion workflow
and at-rest protection are not approved.

Decide:

- retention period for identities, sessions, invitations, usage and receipts;
- whether retained labels/token hashes are minimized after a period;
- assisted-deletion request channel, verification and evidence;
- what must be preserved for accounting, abuse/security and legal obligations;
- whether deletion can ever create new quota/spend capacity (current mechanics
  say no).

## 3. Support ownership and response expectations

Proposal on record: invite issuance, resend, recovery and limit changes are
manual operator actions; no customer dashboard, email delivery, MFA or
self-serve support exists.

Decide:

- named support owner and backup;
- approved support channel and hours;
- response-time expectation and severity definitions;
- who can issue/revoke invitations, reset access and reconcile usage;
- what is out of scope for the first beta.

## 4. Custom Next.js ownership or retirement

Proposal on record: the app-owned Next.js 16.4.5 SRI source artifact is retained
for the rehearsal; `maintenanceOwners` is unassigned.

Decide one:

- name an accountable maintainer and accept the rebase/re-test procedure for
  every upstream security release; or
- approve retirement and replacement with official Next.js, with a separately
  scoped CSP/SRI re-qualification; or
- keep the current artifact only for the closed synthetic environment and do not
  admit customers.

## 5. Persistent hosting and admission scope

Proposal on record: Render and Cloudflare remain options; no persistent
deployment, public DNS/ACME, registry publication or customer admission is
authorized. The accepted qualification is a synthetic loopback-only edge.

Decide:

- intended persistent hosting route and provider;
- private vs public DNS, TLS/ACME and edge authentication;
- whether the first beta is invite-only, export-only and operator-assisted;
- permitted customer data and the applicable privacy/retention terms;
- whether the accepted image/archive is the deployment artifact or whether a
  new image build/qualification is required;
- who may open admission, and the evidence required to do so.

## Current blockers until answered

- No real customer store or customer data may be used.
- No backup destination/key custody means no durable recovery claim.
- No retention/deletion policy means no customer-data admission.
- No support owner means no real invite issuance.
- No custom-Next owner/retirement decision means no release-adopted framework.
- No hosting/admission decision means no deployment or public access.

The synthetic backup/recovery mechanics can continue independently while these
decisions remain pending.
