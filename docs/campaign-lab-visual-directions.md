# Browser offer visual directions

The normal `/campaign-lab/offer` flow accepts a customer's own identity and
campaign, plus one supported direction. This is local operator intake, not
brand extraction, exact brand matching, customer hosting or public launch.
Static remains default; no template, animation or model proposal authority was added.

`visual-directions.ts` is the app-owned 1.0.0 registry. Clear keeps the historical
neutral sans/framed/direct tokens. Editorial uses the existing serif/arch/editorial
features and supported palette. Neither imports fictional brand identity, copy,
claims or attestations. Existing licensed/system font handling is reused.

`browserBrief.directionId` is an optional scalar (`clear` or `editorial`). Missing
means Clear. Null, wrong types, unknown/case-changed/padded IDs and client token
maps are rejected before generation. The server builds its own catalog from
that ID and the operator's input. The shared provider context includes the
selected ID/version and resolved tokens; allowed proposals remain unchanged.
A direction does not authorize an advertorial story. Existing request/context
limits, protected values, headline precedence, validation and provider opt-ins
remain in place. Local fallback resolves from the same registry.

Direction choice exists both at intake and after preview. Editing it retains
unrelated inputs and the local packshot, synchronously invalidates request and
approval guards, and keeps the complete accepted preview until a current valid
result or fallback commits. Accepted preview brief and theme carry the accepted
direction together; the selector can separately show a pending choice. Stale
responses cannot commit through the existing request gate. Approval, image
readiness and export reuse the shared controller.

An optional accent override is explicit intent, including when equal to the old
default. It survives direction switches. With no override, switching selects the
new direction's default. The visible **Use direction accent** action (or clearing
the hex field) removes the override. Invalid colors leave the previous preview
available and require correction. Keyboard text entry supplements the color
picker. New direction/override controls have at least 44px targets.

Prepared briefs and session text optionally carry directionId/accent with schema
1 retained. Old briefs remain valid. Invalid prepared selection is rejected as
one unit before any setters; latest-file-selection protection remains unchanged.
Session restoration keeps pending color text for correction rather than discarding
unrelated fields. Files, confirmations and approval are never restored. Refresh
requires selecting the packshot and confirming/reviewing again.

Only browser brands add the optional direction ID/version to the existing
rendered identity 6; fixture identities without that field stay unchanged.
A changed direction/version or effective appearance requires fresh approval.
New receipts include optional `preview.visualDirection` with ID/version and the
resolved tokens (including accent override), matching HTML metadata. Historical
receipts without it remain readable. Font packaging may map system font stacks
to existing licensed local fallbacks; the receipt and bundled notices retain the
actual packaged file identities. Operator input/attestation remains distinct from
owner-confirmed brand matching or server asset verification. Export compares local
bytes with declared hashes without claiming media rights or external verification.

Focused regressions include browser request validation, real provider-context
resolution, success and invalid/timeout fallback, import/session compatibility,
and existing controller/request-gate checks. Actual operator evidence must enter
two synthetic briefs via visible UI controls, select local approved packshots,
generate and locally approve all four results. Do not substitute profile/source
edits or JSON for those flows. The existing browser skill and capture helper
support 375x812 / 1440x900 viewport screenshots with requested/actual geometry,
hydration/images and screenshot dimensions recorded before/after. No tall or
filename-only capture substitutes for normal-height review. Direct-file playback
remains unassessed after the prior protocol denial; do not retry or bypass it.

Private comparison, four ZIPs/receipts, bounded flow evidence and critical review
live under `C:/Users/joser/.local/ornigami-brand-directions/.local/brand-directions/`.
Reproduce with local-test generation, OPENAI_ENABLED=false and
CAMPAIGN_LAB_GENERATION_LIVE=false. Run Campaign Lab tests, TypeScript, focused
lint, build and production smoke. No paid calls, dependency changes, push, public
CI, publication or deployment are authorized. UX: clear curated choices with
protected identity and recoverable edits. DX/AX: one registry and existing
request/controller/export contracts rather than a parallel generator.
