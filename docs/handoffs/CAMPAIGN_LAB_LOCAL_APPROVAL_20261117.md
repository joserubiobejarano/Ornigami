# Local destination labels and preview approval - 17 November 2026

Status: local, development-only. This is not publication approval.

- Branch: `codex/campaign-lab-local-approval-20261117`
- Base: `b839cb1` (`Default offer headlines to product name unless safe`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/local-approval`
- Entry point: `/campaign-lab/offer`
- Evidence: `docs/handoffs/campaign-lab-local-approval-20261117/`

## Defects addressed

The previous handoff recorded two operator ambiguities:

1. An unconfirmed direct URL and an Amazon search/placeholder URL both read
   `Search/placeholder · provisional`.
2. `Approve preview` looked like publication approval even when the footer said
   the offer or destination was provisional.

This change keeps the existing revision hash, exact-revision approval, and
provisional notices. It only makes the destination state and approval boundary
explicit.

## Destination labels

`DestinationVerification` now distinguishes four rendered states:

| Input state | Data value | Visible label |
| --- | --- | --- |
| Valid direct URL, not confirmed | `unconfirmed` | `Direct URL · unconfirmed` |
| Amazon search or placeholder URL, even confirmed | `search` | `Amazon/search placeholder · provisional` |
| Invalid URL | `invalid` | `Destination invalid` |
| Valid direct URL, exactly confirmed | `direct` | `Direct URL · confirmed` |

The destination hint says:

> A direct URL stays unconfirmed until you check the exact destination. Amazon
> search and placeholder URLs stay provisional after confirmation.

`provisionalOfferInputs` still includes the destination for both `search` and
`unconfirmed`, so the intake notice, pilot status, preview badge, and footer
continue to report a provisional destination.

## Local preview approval

The editor action is now `Approve preview locally`. The recorded status reads:

- badge: `Local preview approval`;
- review text: `Local preview approval recorded — revision <rev>. Not publication
  approval.`;
- preview status: `Local preview approval recorded. Revision <rev> matches the
  preview; this is not publication approval.`;
- help text: the approval applies only to that revision in this browser session
  and is cleared by an edit or a new revision.

`data-approval-scope="local-preview"`, `data-local-preview-approval`, and
`data-approval-revision` were added to the review panel for browser evidence.
The approval predicate is unchanged: it still matches `approval.revision` to the
current rendered `preview.revision` and requires `!dirty`, no generation in
flight, and all required images loaded.

## Browser verification

Chromium `158.0.8127.18`, exact viewports 375 x 900 and 1440 x 1000. The runner
opened the real intake, uploaded a local packshot, submitted the brief, generated,
edited, approved, edited again, generated a provisional destination revision, and
approved that revision locally.

| Stage | 375 px | 1440 px |
| --- | --- | --- |
| Intake: unconfirmed direct | `Direct URL · unconfirmed` | same |
| Intake: Amazon search, confirmed | `Amazon/search placeholder · provisional` | same |
| Intake: invalid | `Destination invalid` | same |
| Intake: direct, confirmed | `Direct URL · confirmed` | same |
| Generated revision | `4b1c3fae06bc1444` | same |
| Edited/regenerated revision | `e96297b272818742` | same |
| Approved revision | `e96297b272818742` | same |
| Edit after approval | approval `false`, revision unchanged | same |
| Provisional search revision | preview status `preview`; footer `Preview · offer, destination provisional` | same |
| Provisional approval | local approval `true`; provisional footer retained | same |

The generated flow kept the exact offer, destination, and packshot identity
across the edit. The review panel and button said local preview at both widths.
No document or preview-canvas horizontal overflow was measured. The browser
console had no errors.

Evidence files:

```text
docs/handoffs/campaign-lab-local-approval-20261117/
  intake-unconfirmed-direct-{375,1440}.png
  intake-unconfirmed-direct-card-{375,1440}.png
  intake-amazon-search-{375,1440}.png
  intake-amazon-search-card-{375,1440}.png
  intake-invalid-{375,1440}.png
  intake-invalid-card-{375,1440}.png
  intake-confirmed-direct-{375,1440}.png
  intake-confirmed-direct-card-{375,1440}.png
  flow-01-generated-{375,1440}.png
  flow-02-editing-pending-{375,1440}.png
  flow-03-edited-generated-{375,1440}.png
  flow-04-approved-local-{375,1440}.png
  flow-04-approval-panel-{375,1440}.png
  flow-05-approval-cleared-by-edit-{375,1440}.png
  flow-06-provisional-preview-{375,1440}.png
  flow-06-provisional-footer-{375,1440}.png
  flow-07-provisional-approved-local-{375,1440}.png
  report.json
```

The runner is `scripts/campaign-lab-local-approval-check.mjs`:

```powershell
node scripts/campaign-lab-local-approval-check.mjs `
  --url http://localhost:3100 `
  --out .local/campaign-lab-local-approval/evidence
```

Result: **30 browser checks passed, 0 failed**.

## Checks

- Campaign Lab focused tests: **95 passed, 0 failed**.
- Acceptance helper tests: **8 passed, 0 failed**.
- TypeScript: passed.
- Focused ESLint: passed.
- Browser runner: passed at both widths.

## Momisa rehearsal inputs

No new brand-operator rehearsal was run because the three required Momisa inputs
are still pending:

1. **Promotion terms and market** - the existing local pilot still carries
   `30% off the Momisa Glow Box for Black Friday` as a benchmark input, not
   confirmed Momisa terms or a confirmed market.
2. **Exact Amazon listing** - the existing local pilot still carries
   `https://www.amazon.com/s?k=Momisa+Glow+Box+sheet+masks`, an Amazon search
   URL, not a direct product listing.
3. **Packshot permission** - the existing local asset still says
   `Pilot use only. Confirm Momisa media rights before publication.`

The previous fixture-only operator rehearsal and its evidence are retained in
`docs/handoffs/CAMPAIGN_LAB_SAFE_OFFER_HEADLINES_20261117.md` and the local
`.local/offer-intake-review/operator-rehearsal/` folder in the
`safe-offer-headline` worktree. No fixture was relabeled as Momisa and no
publication approval was recorded.

## Remaining issue

The free-text Offer field still has no structured market, membership, threshold,
or date inputs. That was outside this change; the destination and approval
labels no longer add ambiguity on top of it.
