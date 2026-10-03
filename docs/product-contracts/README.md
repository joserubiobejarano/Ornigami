# Product contracts

A18 specification and integration handoff, reviewed against baseline ff4d9b2 on 2026-10-02. This directory records observed behavior, proposed policy, and unresolved owner decisions. It implements no runtime changes. The [shared roadmap](../ROADMAP.md) remains with A00.

- [Billing and usage](BILLING_AND_USAGE.md): prices, monthly quotas, trial eligibility, payment recovery, selected location, and seats.
- [Legacy and deferred scope](LEGACY_AND_DEFERRED.md): rebooking, sender settings, booking intake, supporting APIs, QR, and agency boundaries.
- [Speed to Lead](SPEED_TO_LEAD.md): separate future offer, pricing decisions, provider gates, and preserved capabilities.
- [Integration handoff and evidence](HANDOFF.md): shared changes, dependencies, acceptance evidence, and remaining decisions.

Existing catalog prices remain EUR 39/month or EUR 360/year for Replies and Booster individually, and EUR 59/month or EUR 560/year for Complete. Complete includes the two reputation agents. Speed to Lead remains disabled/coming soon and has no approved price, trial, or included volume.

The owner explicitly approved one 14-day trial per business and billing owner on 2026-10-03, including reconciliation for unknown legacy history; A03 implements it. The owner explicitly approved the A06 policy in the A06 chat on 2026-10-03 (2026-10-02 23:09:49 UTC): full UTC calendar-month Booster quotas of 500/1,500, independent of annual invoices, no proration/rollover, usage preserved through trial conversion/upgrades, accepted sends consuming quota, unknown outcomes retaining reservations, and exhaustion deferring only within the existing seven-day eligibility window. This approval applies to Booster; the proposed UTC Reply ceiling and other new policies remain unapproved. Source-backed existing promises are identified separately. An unanswered preference question does not approve a policy.

For A09, recommend scheduled draft generation only, matching current cron behavior. Every path must preserve human-edited drafts; 1–3 star and unknown ratings require manual approval. Only known 4–5 star replies may auto-post through an explicit business-owner opt-in in supported interactive processing. Scheduled posting would require a separate approved policy. Generate, Save, and Post must describe their actual effects. Repeat processing of an unchanged saved draft must not regenerate, overwrite it, or consume another generation unit.

The approval rules for low ratings already appear in the [catalog](../../src/lib/billing/plans.ts), and A09 now implements their shared draft/approval enforcement. Provider acceptance and remaining integration are tracked in the [roadmap](../ROADMAP.md). A08 supplies posting/resource contracts; A09 implements one policy across UI, processing, and cron; A13 aligns copy; A17 validates the result.
