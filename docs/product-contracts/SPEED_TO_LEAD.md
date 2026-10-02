# Speed to Lead product contract

**Status: unresolved; disabled/coming soon.** This A18 decision record is not launch approval. Keep operational signup, checkout, entitlement, sends, and background jobs disabled until product/pricing decisions and implementation/provider acceptance pass. A coming-soon informational surface may remain.

## Current and historical evidence

The [registry](../../src/lib/agents/registry.ts) marks speed_to_lead coming_soon, and [checkout](../../src/app/api/stripe/checkout/route.ts) rejects it. There is no operational lead module, entitlement, Twilio route, or lead workflow schema. Public [/api/leads](../../src/app/api/leads/route.ts) stores audit/marketing enquiries; it is not customer lead intake or qualification.

Current reputation plans, prices, and their 14-day trial apply to reputation workflows only. Complete includes the two reputation agents, with no future lead entitlement or message volume.

Preserved Contactor onboarding labels exact, starting_at, varies, and do_not_discuss describe how a business discusses its own services with prospects. They are not Ornigami lead prices. No approved lead price, included quantity, lead trial, or overage rate was found in reviewed source.

[Preserved Contactor](../../migration-sources/contactor/README.md) contains hosted /f/[businessSlug] intake, lead/conversation/message records, qualification/scoring, AI responses, notifications/escalation, onboarding/admin workflows, and Twilio SMS/WhatsApp inbound/outbound/status callbacks. Its standalone tables and dashboard-user/session models are migration input, not canonical identity or schema.

## Recommended product boundary

These are proposals for owner review, not approved scope.

Define a separately entitled business-scoped agent that captures enquiries, collects agreed qualification details, organizes conversations, and helps a business respond. Start with hosted and embeddable forms sharing validated intake. A published form identifier resolves a business; arbitrary caller-supplied business IDs never establish authorization. Every form, lead, conversation, message, qualification result, usage event, and setting belongs to canonical business_id. Stable provider/source IDs provide idempotency; matching contact identity must not silently merge distinct enquiries.

A02 supplies reviewed canonical identity/business context. A14 implements explicit internal-admin authorization for onboarding review, activation, pricing overrides, provider setup, and cross-business search; do not assume A02 has delivered an admin context. Other users follow shared membership/role rules. Do not port Contactor sessions. Enforce access at APIs, publishing/configuration, provider operations, and jobs. A03 owns billing/trials; A05 owns invitations/seats.

Recommended channel staging: hosted/embed forms first; SMS only after consent evidence, sender routing, signed callbacks, and provider acceptance; WhatsApp only after the specific sender, destinations, and supported use cases are accepted. Countries, channels, and sender ownership remain owner choices. Legacy source labels do not establish native provider connectors.

Persist disclosure/consent evidence, channel, purpose, source, and timestamp before outbound contact. Missing/ambiguous permission blocks automated outreach. Review current official provider requirements and applicable country obligations before launch; this source review establishes no compliance, delivery, or approval evidence.

Validate Twilio signatures against the configured public callback URL and request fields before mutation. Resolve business from assigned provider mapping. Persist stable event/message IDs with appropriate business/provider uniqueness; handle retries, out-of-order callbacks, and events arriving before message persistence. Separate queued, accepted, delivered, failed/undelivered, and unknown states. Reject cross-business references and deduplicate alerts/escalation. Ordinary logs must not expose message bodies, phone numbers, tokens, or sensitive payloads.

## Owner decisions before an offer

No amount, cap, overage, lead definition, lead trial, or pass-through treatment is approved.

1. **Packaging:** standalone, add-on, or bundle. Recommend separate entitlement, excluded from current reputation plans including Complete until affirmatively bundled.
2. **Price/quota:** currency, amount, cadence, included units, period/timezone, overage, downgrade/cancellation, tax display, and disputes. Do not promise unlimited usage.
3. **Billable event:** submitted lead, qualified lead, subscription plus bounded volume, or an explicit combination. Distinguish submission, valid unique lead, qualification, accepted message, and delivery. Qualified-lead billing needs a deterministic rubric and correction/dispute process. Define duplicate/test/spam/existing-contact/unreachable/out-of-scope/missing-consent treatment and provider failure costs. A failed/rejected/accepted message is not a delivered result.
4. **Trial:** eligibility, reuse, duration, included units, provider costs, payment method, notices/end behavior, interaction with reputation trials, and retention. A03 must persist the selected rule; no fresh trial on retry.
5. **Provider costs/spend:** which SMS/WhatsApp/number/AI charges are included or passed through, estimated/actual usage display, finite budgets, alerts, and kill switches. Automated messaging needs explicit owner activation.
6. **Service scope:** countries, channels, intake behavior, automation, languages, support, and exclusions. Marketing and checkout must match the accepted setup.

Before sale, disclose amount, cadence, included units, counting rules, exclusions/provider charges, trial end, and cancellation. Metering retains event, policy version, classification evidence, source/business, and corrections. Do not derive invoices solely from mutable lead status. Pricing must follow a reviewed unit-cost model; no placeholder amount is proposed here.

## Acceptance gates

- Owner decisions agree across marketing, terms, checkout, entitlement, trial, and metering. Existing Complete customers receive no implied lead access.
- Hosted/embed intake is scoped, validated, rate limited, replay safe, and stores disclosure/consent evidence. Marketing /api/leads remains separate.
- Owner/member/internal-admin and cross-business isolation hold across pages/APIs/configuration/onboarding/provider setup/billing/export/deletion.
- Invalid signatures fail; assigned routing is authoritative. Duplicate/reordered callbacks do not duplicate records, usage, outbound messages, or alerts. Accepted and delivered remain distinct.
- Automated sends require channel eligibility and consent. Suppression/opt-out, owner takeover, escalation, spend caps, failure recovery, and manual fallback pass isolated acceptance.
- Namespaced schema and privacy coverage include forms, leads, conversations, messages, events, consent, and usage. Importing sent/failed/suppressed history cannot resend historical contacts.
- Provider sandbox/approved-account evidence proves only tested channels. Mocks do not establish live approval or readiness.

These are required future tests, not tests implemented by A18.

## Legacy preservation

If approved, retain or explicitly resolve hosted/embed forms, qualification/context, conversation history, owner takeover/escalation, deduplicated notifications, onboarding/activation, prompt/settings, and delivery history. Each needs canonical ownership, migration, privacy, and acceptance contracts.

A configured legacy database appearing empty does not establish every deployment/embed is empty. A15 inventory, mapping, reconciliation, and rollback precede cutover or retirement. See [legacy boundaries](LEGACY_AND_DEFERRED.md). Local SEO, project APIs, QR, and agency scope are separate decisions.

## Integration dependencies

| Owner | Required handoff |
| --- | --- |
| A02 | Reviewed identity/business context and shared entitlements. |
| A03 | Approved offer, owner-only mutations, trial history, usage metadata, and subscription reconciliation. |
| A05 | Invitations/seats affecting workflow access; no lead billing ownership. |
| A01 | Any Twilio/runtime dependency and lockfile addition; preserved manifests are reference material. |
| A10/A11 | Provider event semantics and export/retention/deletion. Twilio is absent from current processor disclosures; review/update those through A11 before provider use. |
| A14 | Disabled module, thin routes, explicit internal-admin checks, canonical foreign keys and stl_* schema; no duplicate auth or initial Drizzle migration replay. |
| A15 | External inventory, ID mapping, dry runs, reconciliation, cutover/rollback. |
| A17 | Pricing/trial/access/provider/privacy/failure/rollback acceptance after implementations are ready. |

## Evidence

Reviewed [roadmap C03–C05/A14/A15/A18](../ROADMAP.md), [project scope](../PROJECT_SCOPE.md), registry, catalog, pricing, checkout, marketing leads, and preserved Contactor [schema](../../migration-sources/contactor/src/server/db/schema.ts) and [orchestration](../../migration-sources/contactor/src/server/services/inbound-lead-orchestrator.service.ts). Current [processor disclosures](../../src/lib/legal-processors.ts) exclude Twilio.

Local source evidence only: no provider rates, country availability, legal obligations, live configuration, embeds, or external databases were independently verified.
