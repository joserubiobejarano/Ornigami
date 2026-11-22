# Owner decisions required for an invite-only export beta — 22 November 2026

Status: **pending. No decision below has been assumed or approved.** Existing
documents are proposals, not adopted policy. No message was sent and no external
participant was contacted under the current authorization.

This is the single consolidated request. Please answer each item with an explicit
decision, owner/date and any conditions. Unanswered items remain visibly pending.

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
