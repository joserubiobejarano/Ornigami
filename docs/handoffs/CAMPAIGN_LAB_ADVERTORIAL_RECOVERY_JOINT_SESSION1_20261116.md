# Advertorial recovery joint — Session 1 handoff

Status: local, deterministic runner, editor, and validation fixes. No renderer
CSS, live provider, publishing, or persistence changes.

- Branch: `codex/campaign-lab-advertorial-recovery-joint-session1`
- Base: `1081e15` on `codex/campaign-lab-advertorial-recovery-joint`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/blue-kiln`
- Ownership: this session fixes the real-brand two-layout runner and the editor
  recovery copy. Session 2 owns independent browser acceptance review.

## Reproduced findings before the fix

The synthetic QA packages remain in ignored local storage:
`.local/campaign-lab-pilots/review-ready-path-qa`,
`review-optional-facts-qa`, and `review-broken-media-qa`.

```powershell
$env:CAMPAIGN_LAB_PLAYWRIGHT='C:\Users\joser\.local\ornigami-campaign-lab-advertorial-recovery-joint\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs'

node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-ready-path-qa `
  --no-prepare --out .local/campaign-lab-review/before-ready

node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-optional-facts-qa `
  --no-prepare --out .local/campaign-lab-review/before-optional

node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-broken-media-qa `
  --no-prepare --out .local/campaign-lab-review/before-broken
```

Observed before:

| Case | Result | Finding |
| --- | --- | --- |
| `review-ready-path-qa` | passed | Baseline two-layout case. |
| `review-optional-facts-qa` | **failed** | No required group exists, so the runner expected all four optional facts. Template capacity is three. |
| `review-broken-media-qa` | **passed incorrectly** | The `review-hero` bytes fail the pinned hash and both asset requests return 404, but the runner never checked image decode or approval. |

## What changed

### Real-brand two-layout runner

- Mandatory facts now come only from `brief.requiredFactGroups`; an absent group
  does not turn every optional fact into a requirement.
- Optional facts may be omitted within template capacity.
- Every rendered fact must exist in the approved brief and keep its approved
  visible value.
- Required facts must be present in both layouts with their approved values.
- For each rendered revision, every image in the preview's asset assignment must
  be present in the DOM, complete, have non-zero natural dimensions, and decode.
- A failed required image fails the browser result and names the asset ID.
- Approval must be disabled while a required image is pending or failed. When all
  images load, approval must become available and must record the exact revision
  the runner inspected.
- The final `two-layout-browser-run` check now reflects the individual image,
  approval, fact, layout, and commercial checks.

Intake readiness remains separate: the hash-mismatched package can pass intake
readiness while its browser result fails on the broken image.

### Four-fact editor alert

- The capacity alert no longer offers an action the editor cannot perform. It
  keeps the capacity error and explains that the approved brief must be revised
  outside the editor, then the page reloaded.
- The empty preview is reduced to one status and one next step.
- The complete group, approval gate, last-valid-preview behavior, and offer-page
  behavior are unchanged.

## After-fix results

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-ready-path-qa `
  --no-prepare --out .local/campaign-lab-review/after-ready

node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-optional-facts-qa `
  --no-prepare --out .local/campaign-lab-review/after-optional

node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-broken-media-qa `
  --no-prepare --out .local/campaign-lab-review/after-broken
```

| Case | Result | Evidence |
| --- | --- | --- |
| ready-path | **passed** | Full: 2 assigned images loaded/decoded; approval recorded revision. One-photo: 1 assigned image loaded/decoded; approval recorded revision. |
| optional-facts | **passed** | No mandatory group. All rendered facts came from the approved brief; required-fact check reports optional omission is allowed. |
| broken-media | **failed as required** | Both layouts failed required image checks for `review-hero` (`0x0`, decode false). Approval stayed disabled; final browser run failed. |

Broken-media detail:

```text
two-layout-full-images-loaded: failed - review-hero (0x0, decode=false)
two-layout-one-photo-images-loaded: failed - review-hero (0x0, decode=false)
two-layout-full-approval-gate: passed - approval stays disabled
two-layout-one-photo-approval-gate: passed - approval stays disabled
two-layout-browser-run: failed
```

## Regression checks

- Full browser acceptance suite: **10 passed, 0 failed, 1 pending** (real-brand
  pending for the default Momisa package).
- `images.revision-switch`: passed, including the A → B → A stale-image path.
- Targeted case selection: `--only images.404` produced exactly one passed case;
  `--only images.40` exited nonzero with the setup failure.
- Offer-page regressions: **144 passed, 0 failed, 0 pending** after the dev
  server was warm.
- TypeScript and focused ESLint passed.
