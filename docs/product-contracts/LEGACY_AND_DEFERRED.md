# Legacy capabilities and deferred boundaries

**Status: source-backed preservation requirements and proposed target policy.** New validation/UI/send rules below require owner approval and package acceptance. They do not establish deployed features or migrated data.

## Verified current behavior

### Rebooking and sender customization

The canonical business schema, [types](../../src/modules/review-booster/types/followup.types.ts), and [settings query](../../src/modules/review-booster/services/review-booster-db.service.ts) retain nullable rebooking_url and email_from_name. The [settings UI](../../src/modules/review-booster/pages/settings-page.tsx) does not load/edit them. The [settings POST](../../src/app/api/review-booster/settings/route.ts) clears both on every successful save.

The [runner](../../src/modules/review-booster/services/followup-runner.service.ts) passes the sender display name to [Resend](../../src/modules/review-booster/services/resend.provider.ts), falling back to business name. Sender address comes from server EMAIL_FROM. No customer-owned address/domain verification feature exists. Current generator/provider do not use rebooking_url.

[Preserved Follow-Up helpers](../../migration-sources/follow-up/src/server/services/followups.ts) and [email generation](../../migration-sources/follow-up/src/server/services/followup-email-generator.ts) retain optional booking/name concepts. Historical sender-name support did not establish a customer-owned sending domain. Existing values must survive refactors/imports; inactive use must not be presented as implemented parity.

### Booking intake and sendability

No canonical /api/webhooks/booking route exists. Manual/CSV visits are supported. [Manual intake](../../src/app/api/review-booster/visits/route.ts) accepts phone-only records, but the email runner selects records with email. Phone-only records cannot receive current email follow-ups; Booster has no SMS workflow.

The [preserved booking handler](../../migration-sources/follow-up/src/app/api/webhooks/booking/route.ts) accepted generic events and square/opentable/fresha source labels, used global Basic Auth/caller-supplied business identity, and separately inserted event/visit. These are migration inputs, not native connector or authorization guarantees.

### Location, audit, and project surfaces

Booster settings expose connected locations and can select/fall back to the first returned location. The business-level manual URL is length checked. The [tracked redirect](../../src/app/r/%5Btoken%5D/route.ts) uses a signed destination; signing does not validate an unsafe destination. The business-shared selected-location target is in [BILLING_AND_USAGE.md](BILLING_AND_USAGE.md).

[Local SEO](../../src/app/local-seo/page.tsx) and [free audit](../../src/app/free-audit/page.tsx) remain public. The [audit route](../../src/app/api/audit/free-profile/route.ts) validates/rate-limits requests, generates a quick audit with gbpData null, optionally extracts a score from text, and attempts storage in the marketing leads table. Copy/mock previews do not prove a live Google-data audit, paid SEO agent, or ranking guarantee.

[Project APIs](../../src/app/api/projects/route.ts) remain legacy user-scoped project-history/content compatibility surfaces and support dashboard metrics. There is no current /content page. No complete consumer/data inventory establishes they can be retired.

The tracked /r/[token] redirect is part of Booster, not a QR creation/management product.

## Proposed target contract

### Retain optional settings without silent erasure

Keep both fields nullable and compatible with existing clients. On the existing POST update, omission preserves a stored value; explicit null clears it; supplied empty string may normalize to null. Invalid types fail validation rather than clearing data. Return persisted values on reads/update responses. Apply this distinction to imports and future API/schema changes.

Retain rebooking as an optional **secondary CTA in the same review-request email**, only when configured. No second email, separate sequence, or extra request unit is implied. It cannot replace the review CTA or condition review requests on sentiment. With no URL, omit the booking CTA. Suppression covers the whole message. Capture the destination or hold queued work for review on destination changes, following the billing/location contract.

Sender name is display customization only. Proposed maximum: 120 characters; reject CR/LF and header control characters, and escape safely in provider headers/rendering. Sender address stays controlled by EMAIL_FROM. Display-name changes do not verify an address/domain. Customer-specific sending domains require separate A10 setup/acceptance.

### Validate destinations separately

Proposed maximum URL length: 500 characters. Require parsed absolute HTTPS URLs; reject malformed input, userinfo/credentials, control characters, and unsafe schemes. Normalize and escape links for HTML attributes and plaintext; use safe external-link rendering.

Google review links need an exact approved host/path allowlist. Proposed initial candidates for A07/A08 validation: search.google.com/local/writereview with a placeid; g.page/{id}/review; and supported Maps review destinations on www.google.com/maps or maps.google.com. Do not accept every path on a Google host or use a substring/suffix check permitting lookalike hosts. Exact supported path/query/short-link variants remain an integration decision verified with known review links. Provider-derived metadata must receive the same destination validation.

Rebooking may point to the business's HTTPS booking service on a non-Google host; Google-host restrictions do not apply. It must not become an arbitrary redirect parameter. Any short-link resolution/fetching added later requires redirect/destination validation and protection against private-network destinations; no new URL-fetch feature is proposed here.

A07/A08 must review stored destinations before reusing them. Invalid legacy values should be retained for correction/export while blocked from rendering/sending, rather than erased silently. Signing a token never substitutes for destination validation.

### Secure generic intake and show non-sendability

A future booking route resolves business from scoped integration credentials, authenticates/verifies sender, validates event/contact data, checks Booster entitlement, and atomically deduplicates event plus visit. Caller business_id alone is not authorization. Replayed input creates at most one event/visit pair.

Generic source labels remain generic. Native Square/OpenTable/Fresha claims require their actual authentication, mappings, retries, and controlled provider acceptance. Do not port global Basic Auth.

Phone-only records may persist for compatibility/import but are visibly non-sendable for email and excluded from its queue. Valid email is required before queueing. No SMS promise follows from storing a phone number; consent, provider, delivery, entitlement, and pricing contracts would be separate.

### Retain supporting surfaces; defer retirement

Keep Local SEO/free audit as supporting surfaces while behavior/data remains in use. Recommend describing the audit as an AI-generated quick check unless fetched data and repeatable score criteria are implemented and accepted. No paid SEO entitlement, ranking guarantee, or launch date is established. Their strategic prominence remains an owner choice; A13 aligns navigation/marketing with actual behavior and removes unavailable-feature timeline promises.

Keep project routes/tables until A00/A15 inventory consumers, dashboard metrics, stored-data obligations, and replacement/deprecation needs. Retirement requires usage evidence, export/migration choice, compatibility and notice/transition policy. This contract authorizes no deletion or redirect.

Explicitly defer QR/short-link tools and broader agency hierarchy until current paid workflows are stable. The supported hierarchy is business/member workspace with existing plan seats. No nested organization, cross-client administration, additional seat entitlement, or delivery date is promised. Speed to Lead is separately specified and disabled in [SPEED_TO_LEAD.md](SPEED_TO_LEAD.md).

## Implementation handoffs and acceptance

| Owner | Required change |
| --- | --- |
| A07 | Omission-preserving POST, explicit clearing, settings read/UI support, distinct link rules, optional same-email booking CTA, non-sendable phone state, authenticated atomic generic intake. Coordinate provider changes with A06/A10. |
| A08 | Shared selected-resource enforcement; no invalid-selection fallback. Validate derived review destinations with A07. |
| A10 | Display-name/address/domain distinctions and delivery/suppression semantics; customer-specific domains deferred. |
| A13 | Settings/sendability guidance, separate CTA labels, public audit positioning and actual feature/timeline claims. |
| A14 | Keep future lead workflow disabled and separate from marketing leads; preserve accepted legacy capabilities deliberately. |
| A15 | Legacy customer/callback/embed/database/job inventory and transition; preserve settings, sent/suppressed state, and URLs with mapped identities. |
| A11 | Export/retention for retained settings and audit/marketing records; suppression cannot be purged to resume mail accidentally. |

Future acceptance cases: unrelated saves preserve both fields; null clears only the intended field; invalid values do not erase stored data; valid non-Google HTTPS booking URLs work while HTTP/credential/control-character/lookalike review links fail; sender names cannot alter headers/address; configured booking is one secondary CTA with one request charge; missing booking omits it; suppression blocks the whole email; replay/cross-business credentials cannot duplicate or misroute visits; phone-only rows never reach Resend; audit copy does not claim fetched GBP data; consumers/data are inventoried before project retirement.

## Dependencies and open decisions

No dependency or schema change is made here. New validation/provider/UI changes belong to named owners; A00 coordinates migrations. Owner must approve retained CTA behavior, exact URL variants, strategic audit prominence, and any future retirement. A15 must verify deployed reliance and old webhook transitions. Audit/lead retention and project notice timing remain unresolved.

The roadmap records inaccessible Follow-Up database credentials. Lack of inspected records does not establish absence of customers/data. No preserved originals, legacy runtime, deployment, database, or backup is changed.
