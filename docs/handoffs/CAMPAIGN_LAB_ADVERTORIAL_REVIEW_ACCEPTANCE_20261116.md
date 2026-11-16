# Advertorial review acceptance — 16 November 2026

Status: test-only branch. No app, renderer, API, or pilot-loader changes.

- Branch: `codex/campaign-lab-advertorial-review-round3-acceptance`
- Base: `d9ebefb` (`Combine advertorial review fixes and evidence layout`)
- Worktree: `C:/Users/joser/.local/ornigami-campaign-lab-advertorial-review-round3-acceptance`
- Runner: [`docs/campaign-lab-review-acceptance.md`](../campaign-lab-review-acceptance.md)
- Script: `scripts/campaign-lab-review-acceptance.mjs`
- Staging: `scripts/prepare-campaign-lab-review-pilots.mjs`

## Baseline result on d9ebefb

Command:

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/baseline-d9ebefb-final
```

**10 cases: 2 passed, 7 failed, 1 pending.**

| Case | Result | Failure reproduced or check kept |
| --- | --- | --- |
| `capacity.direct-open` | failed | Four-fact pilot returns `500`; no capacity error or recovery action. API returns `422`. |
| `capacity.recovery` | failed | No recovery action exists after the crash. |
| `failed-edit` | passed | Last valid preview, facts, exact CTA, approval reset, and correction all hold. |
| `images.delayed` | failed | Approval is enabled while the required image request is held. |
| `images.404` | failed | Approval is enabled after the image `404`; no failure message is shown. |
| `images.recovery` | failed | No in-editor recovery action; a fresh page load is the only fallback. |
| `images.revision-switch` | failed | Approval is enabled while the new revision's image is pending; the old response does not correct it. |
| `long-label` | failed | Document width is 568 px at 320 px. The exact label and keyboard controls remain reachable. |
| `distinct.both-formats` | passed | Both formats keep their own opening; API revision, images, required facts, and exact CTA match the DOM. |
| `real-brand.pending` | pending | Momisa is still missing the advertorial story, confirmed offer/destination, disclosure, supporting image, paid media rights, and source-campaign record. |

Raw captures and the per-case report stay in the ignored
`.local/campaign-lab-review/baseline-d9ebefb-final/` directory. They are evidence for
this baseline only.

## Session 1 run

Session 1 commit `364590b` was verified in a separate worktree with this test
commit applied.

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/session1-final-364590b
```

**10 cases: 9 passed, 0 failed, 1 pending.**

- Capacity direct open and recovery pass.
- Delayed image, 404, recovery, and revision-switch approval gates pass.
- Failed edit still passes.
- The long label fits 320 px with keyboard access.
- The distinct-opening pilot still matches API revisions, images, facts, and the exact CTA in both formats.
- Real-brand remains pending; the Momisa package still lacks the inputs above.

Raw evidence is in the verification worktree's ignored
`.local/campaign-lab-review/session1-final-364590b/` directory. Do not describe
the pending real-brand case as passed.
