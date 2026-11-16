# Advertorial recovery acceptance — 16 November 2026

Status: test-only branch. No editor, renderer, API, or pilot-loader changes.

- Branch: `codex/campaign-lab-advertorial-recovery-acceptance`
- Base: `109536c` (`Combine advertorial recovery fixes and acceptance runner`)
- Worktree: `C:/Users/joser/.local/ornigami-campaign-lab-advertorial-recovery-acceptance`
- Runner: [`docs/campaign-lab-review-acceptance.md`](../campaign-lab-review-acceptance.md)
- Script: `scripts/campaign-lab-review-acceptance.mjs`
- Staging: `scripts/prepare-campaign-lab-review-pilots.mjs`
- Session 1 dependency: editor recovery-recommendation fix

## Delivered runner changes

- Unknown case IDs fail before preparation or browser startup.
- Every requested case must produce exactly one result; missing or duplicate IDs
  add a failed `runner.selection` result.
- Documented case IDs are also available with `--list`.
- `capacity.recovery` now requires any recommended format/layout to render the
  whole required group. The four-fact pilot cannot satisfy that by switching to
  the offer template, which also rejects four facts.
- New `capacity.alternate-format` case proves a valid alternate recommendation
  really renders the whole brief and keeps the exact commercials.
- `images.revision-switch` now runs A → B → A. It proves from the browser that
  returned A has a pending image before asserting approval stays blocked. If
  Chromium reuses a loaded image, the path is reported as unexercised.
- Image status must not claim approval is available after an offer edit while a
  pending image disables the Approve control.
- Real-brand reporting separates intake readiness from a completed two-layout
  browser run. Incomplete inputs produce one explicit pending result and point
  to the existing checklist.

## Targeted selection proofs

```powershell
# Unknown ID: nonzero
node scripts/campaign-lab-review-acceptance.mjs `
  --only images.40 --out .local/campaign-lab-review/target-unknown

# Valid image selector: one result
node scripts/campaign-lab-review-acceptance.mjs `
  --only images.404 --out .local/campaign-lab-review/target-images-404

# Missing real-brand inputs: one explicit pending result
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --out .local/campaign-lab-review/target-real-brand
```

Observed:

- `images.40` → exit `1`, unknown-ID setup failure.
- `images.404` → one passed case, exit `0`.
- `real-brand.pending` → exactly one pending case, exit `0`, with
  `intakeReadiness.ready: false` and
  `twoLayoutBrowserRun.status: "not-run"`.
- A known case requested against a pilot that does not host it → nonzero, no
  silent zero-result pass.

## Baseline on 109536c

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/final-109536c
```

**11 cases: 9 passed, 1 failed, 1 pending.**

| Case | Result | Observation |
| --- | --- | --- |
| `capacity.direct-open` | passed | Editor returns `200` and shows the four-fact capacity error. |
| `capacity.recovery` | failed | **Use single-product offer** is recommended even though the offer template also rejects four facts. |
| `capacity.alternate-format` | passed | The valid offer recommendation renders the whole three-fact group. |
| `failed-edit` | passed | |
| `images.delayed` | passed | |
| `images.404` | passed | |
| `images.recovery` | passed | |
| `images.revision-switch` | passed | A → B → A exercised the returned-A pending-image path; it was not cached out. |
| `long-label` | passed | |
| `distinct.both-formats` | passed | |
| `real-brand.pending` | pending | Intake incomplete; two-layout browser run not claimed. |

Raw captures and reports stay under the ignored
`.local/campaign-lab-review/` directory.

## Session 1 rerun

The latest available Session 1 editor is `109536c`, which includes the
`364590b` editor fixes. The full suite at that commit produced **9 passed, 1
failed, 1 pending**:

- The only failure is `capacity.recovery`: the editor still recommends
  **Use single-product offer** for the four-fact group even though the offer
  template also rejects it.
- `capacity.alternate-format` passes, so a recommendation that can render the
  brief works.
- `images.revision-switch` passes the A → B → A pending-image path.
- `real-brand.pending` remains pending with intake readiness false and the
  two-layout browser run not claimed.

No Session 1 commit after `109536c` was available at verification time. When its
recovery-recommendation fix lands, apply this test commit in a separate worktree
and rerun into a new output directory. Record each case separately; keep
`real-brand.pending` pending while its inputs are incomplete.
