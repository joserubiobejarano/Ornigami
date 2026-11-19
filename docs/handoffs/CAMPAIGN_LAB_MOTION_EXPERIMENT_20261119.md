# Reusable motion experiment — implementation handoff

Implemented on `codex/ornigami-motion-experiment-20261119`, starting exactly from
`51639c43fd665e6c67b5d6f40ef5c1b8f020df33`. The verified parent chain is
`51639c4` → capture-only `4dffe36` → reviewed builder `c455da3`. Worktree:
`C:/Users/joser/.local/ornigami-motion-experiment`. The dirty legacy main checkout,
other worktrees, and historical experiments were preserved.

The [implementation contract](../campaign-lab-motion.md) documents the typed
`none`, `quiet-product`, and `product-inspect` recipes, exact authoring source and
MIT attribution, revision identity 5, native dialog behavior, shared owned
runtime, sanitized canonical export, and reproduction commands. No model proposal
fields or animation dependencies were added. The existing direct-offer editor
owns selection; recipe edits clear approval and cancel outstanding exports.

One frozen synthetic Harbor Field campaign supplies every protected input and
the same SHA-256-checked packshot. All variants share the tablet crop correction
and stable CTA feedback. Inspection uses only native pixels from that packshot,
with fit/enlarge, directional controls, keyboard/native scrolling, dismissal,
and focus restoration. A reproduced empty-corner zoom was corrected to centre
the image before the critical review.

Private final deliverables are under `.local/motion-experiment/final/`:
`index.html`, three `<recipe>/campaign.zip` exports and extracted bundles,
editor/offline/fallback captures, playback and interruption traces, `frozen.json`,
and `report.json`. The private `.local/motion-experiment/REPORT.md` records the
exact clean tested SHA, complete verification commands/results, payload and
performance observations, earlier failed tooling attempts, and limitations.
Use those receipts rather than treating an earlier dirty-tree run as the final
source acceptance. Pre-commit verification passed 202 Campaign Lab tests,
TypeScript, focused ESLint, and the 429-check matrix before the last canonical
style-export and backdrop-test additions. Production smoke now checks the
development-only Campaign Lab pages and generation endpoint as well as its
existing CSP/auth/billing boundaries.

Critical recommendation: retain `none` as default; reject `quiet-product` as a
default for this campaign because it conveys no additional information; retain
`product-inspect` as an optional utility, not a universal default. Native-pixel
inspection makes existing markings visible on narrow screens but introduces
controls, modal focus and payload. No owner approval, conversion lift, or general
design superiority is inferred.

Touch is emulated in Chromium/Windows. Physical phones, screen readers,
Safari/Firefox and field performance are unqualified. Native hidden-tab state
was not exposed by headless tab activation in the pre-commit observation;
visibility-event cancellation is explicitly simulated while offscreen and
preference-change interruptions exercise real playback. Local timing/layout
shift samples must not be generalized.

Turbopack could not follow a dependency junction outside its workspace root;
webpack is the documented local fallback. A missing Playwright video codec led
to traces/checkpoints rather than a tool installation. Those attempts remain
private evidence. No paid calls, purchases, credential/billing changes, public
CI dispatch, push, deployment, or publication occurred. Further rollout and
cross-browser/device qualification require their own scope. Static remains a
valid winner.
