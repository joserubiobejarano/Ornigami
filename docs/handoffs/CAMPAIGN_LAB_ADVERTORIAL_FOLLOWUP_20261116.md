# Advertorial follow-up acceptance — 16 November 2026

Status: runner fix delivered. Real-brand advertorial comparison remains pending
because the available Momisa package lacks an approved story and supporting
media.

- Branch: `codex/campaign-lab-advertorial-followup-acceptance`
- Base: `f49451d` — Session 1's verified commit on top of `1081e15`
- Worktree: `C:/Users/joser/.local/ornigami-campaign-lab-advertorial-followup-acceptance`
- Runner: `scripts/campaign-lab-review-acceptance.mjs`
- Contract: [`docs/campaign-lab-review-acceptance.md`](../campaign-lab-review-acceptance.md)

## Duplicate-assignment false failure

Reproduced with the ignored `review-duplicate-assignment-qa` package:

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-duplicate-assignment-qa `
  --no-prepare --out .local/campaign-lab-review/followup-before-fix
```

Before: `two-layout-removes-only-supporting-images` failed because the runner
expected every manifest assignment to render, including `story-opening`
`review-opening`, which has no supported slot.

After: the full article is compared with the assets assigned to its inspected
revision. `review-opening` is reported as unused; `review-use` and
`review-opening` are unused in one-photo. Full still requires the loaded packshot
and a placed supporting image. One-photo requires only the packshot.

Verified at 375 px and 1440 px:

```text
full revision      f8c36d32fc022e15
  assigned         review-hero, review-use
  unused           review-opening
  approved         f8c36d32fc022e15

one-photo revision 4c957a465b92c380
  assigned         review-hero
  unused           review-use, review-opening
  approved         4c957a465b92c380
```

Both widths keep the same story, required/rendered facts, exact offer
`Free shipping through 30 November 2026`, action `See the dripper`, and
destination `https://example.com/morrow`.

Evidence: `.local/campaign-lab-review/followup-duplicate-final/`.

## Broken-packshot retest

`review-broken-media-qa` still fails as required at 375 px and 1440 px in both
layouts:

- `review-hero` is `0x0`, `decode=false`.
- Approval stays disabled while the required image fails.
- The full-layout packshot-plus-supporting check fails.
- `two-layout-browser-run` fails.

Evidence: `.local/campaign-lab-review/followup-broken-media2/`.

`review-ready-path-qa` and `review-optional-facts-qa` still pass at both widths.

## Momisa real-brand readiness

The normal intake accepted the private package, but readiness is **false**.
Detailed record: ignored `.local/campaign-lab-review/momisa-intake-record.json`.

| Input | Status |
| --- | --- |
| Incoming campaign promise | missing — no source-campaign record |
| Sourced story | missing — no approved opening, story beats, or transition |
| Printed facts | available — Contents 3 sheet masks; Vitamin C; Deep Collagen; Hyaluronic Acid; For all skin types |
| Packshot | available for pilot review only — `momisa-glow-box-front`, 2500×2500, SHA-256 `6b5521df6d67249ff7c50a2ff88836a655720dcd27779de2eed0ef2ac3974211` |
| Supporting media | missing |
| Final offer | missing — 30% Black Friday is a placeholder |
| Disclosure | missing |
| Direct destination | missing — Amazon search URL is a placeholder |
| Pilot status | preview |

No full/one-photo real-brand run or layout recommendation is claimed. The layout
choice depends on whether approved supporting media adds evidence beyond the
packshot.

## Owner request draft

> **Subject:** Momisa Glow Box advertorial — final offer, listing, and packshot permission
>
> Hi [Owner],
>
> Before we can produce the Momisa Glow Box advertorial, please confirm three
> things:
>
> 1. The final offer terms and dates — discount, market, start and end dates, and
>    any exclusions.
> 2. The exact Amazon product listing URL, rather than a search results page.
> 3. Permission to use the supplied Glow Box packshot in a paid advertorial,
>    including any required credit or usage restrictions.
>
> If you also have an approved brand story or supporting product photography,
> please send those with the source and usage terms.
>
> Thanks,
> [Name]

## Run commands

```powershell
# Duplicate-assignment regression
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-duplicate-assignment-qa `
  --no-prepare --out .local/campaign-lab-review/followup-duplicate-final

# Broken-packshot regression
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-broken-media-qa `
  --no-prepare --out .local/campaign-lab-review/followup-broken-media2

# Momisa readiness
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand momisa `
  --no-prepare --out .local/campaign-lab-review/followup-momisa-final
```
