# Palette recovery and TLS integration

19 November 2026, Europe/Madrid. Dedicated worktree:
`C:/Users/joser/.local/ornigami-brand-recovery`, branch
`codex/brand-recovery-integration-20261119`. The legacy checkout and source
worktrees were preserved. Existing dependencies are reused through an ignored
node_modules junction to `C:/Users/joser/.local/ornigami-brand-integration/node_modules`.
No install, upgrade, paid call, live URL access, push or deployment occurred.

History-preserving merge `b2e2a916809c5897c7d9258b2698a3e921224c34` has parents:

- `e8bd78ad4b354975eacf1d29a2d860e9a2d57307` (palette application, first parent).
- `a8adeea2bb4615fb8e34c7a573337ac64346525e` (TLS qualification, second parent).

The recovery implementation/evidence commit follows this merge; obtain its exact
identity with `git rev-parse HEAD`. The final delivery reports that identity.

Before changing source, the normal intake loaded the frozen Fjord brief/evidence,
selected UI accent `#163f64ff`, entered white in the separate accent override and
attempted Apply. Apply failed with the offer-tint contrast error. Changing only
the external accent to `#123456` left Apply disabled with the old error; switching
to Editorial also left it stuck. [Screenshot and DOM evidence](examples/brand-recovery/GALLERY.md)
are from this actual unmodified merged UI, not the reviewer's inferred path.

Current validation is derived on every render from draft choices, direction and
override. `reviewPalette` builds the same strictly parsed snapshot and calls the
unchanged contrast resolver; only a current successful result can apply.
`importError`, `importValid` and pending-file state remain separate and authoritative.
External props and candidate edits cannot erase a file error. Cancellation
invalidates late reads without clearing the last error/gate. A new invalid file
retains prior draft details for inspection, but cannot apply that prior draft.
The latest-selection reader prevents old success/error from replacing new results.

The optional panel now leads with role, value/correction and source. Raw confidence,
uncertainty, source hash and quote are under a labeled color disclosure; global
warnings/sources retain their disclosure. Ownership/facts/rights uncertainty stays
visible. Source-byte verification remains explicitly unavailable. UI versus photo
evidence, alpha correction, all three roles and all contrast checks are preserved.

Final-source normal editor journey:

| Step | Observed result |
| --- | --- |
| Apply reviewed Fjord accent, select original packshot, confirm exact offer/destination/rights; generate local-test success | Initial revision `8f2fb01c3836dae3`; fresh local approval enabled export. |
| Load evidence, choose accent, external white override | Current contrast error; Apply blocked. Last valid preview retained; pending edit clears approval and locks export. No invalid theme published. |
| External correction to `#123456` | Apply enabled immediately, no unrelated edit/reload. Keyboard Enter applied successfully. Preview remained the initial revision and export stayed locked. |
| Direction-sensitive `#646464` correction | Editorial failed; changing only direction to Clear enabled Apply. The unit case also verifies reversing direction rejects it again. |
| Invalid saved file, then change external accent and direction | Import error persisted; Apply stayed disabled. Valid same-file retry recovered. |
| Generate corrected applied palette | New revision `d36c263b05efa470`, local-test success, live false; prior approval did not carry forward. |
| Freshly approve and export | Exact new revision in downloaded receipt and HTML; 13 files verified. |
| Explicit override removal | Effective editor accent exposed reviewed `#163f64`, export locked. Restoring override, generating and freshly approving again retained canonical revision `d36c263b05efa470`. |

Product/brand, audience/objective, exact offer/destination, facts, action, packshot
bytes/alt/rights and confirmations were not rewritten. The fresh package has
effective `#123456` above reviewed `#163f64`; all snapshot authority flags remain
false. Packshot SHA-256 is
`0cfa8235e88ec443bc5fb22af3eba5ecb85076b1f920d9f6e20fe6b6b4fd8863`.
Saved-evidence acceptance did not confer owner/fact/media approval. Existing
request-cancellation and stale-response gates were retained and exercised by the
complete suite. Existing two-campaign service tests verify success, invalid and
timeout fallback preserve palette, offer and packshot. This run's fresh browser
export uses success; no new browser timeout export is claimed.

The transport deadline test now waits for actual fixture stage entry: queued writes
while connecting, emitted request bytes while awaiting headers, incoming parser
bytes for incomplete chunked body. An event-loop turn precedes manual-clock expiry.
Each stage requires one live socket before expiry and destruction, timer/listener
cleanup and no late request/connection afterward. A genuine real-time 20ms deadline
smoke retains abort/cleanup assertions without requiring a connection to have opened
before expiry. No longer sleep was introduced. Initial fixture assertions failed
because generic Duplex immediately accepts writes while marked connecting; the
fixture now holds connecting writes as a real socket would. Intermediate logs remain.

All final application/test source changes preceded these checks:

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/campaign-lab-brand-recovery.test.mts tests/campaign-lab-brand-review.test.mts tests/campaign-lab-brand-resource-transport.test.mts tests/campaign-lab-brand-tls.test.mts` | 44/44 passed, no skips/cancellations; includes all 17 TLS tests. |
| Discover sorted `tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs`, pass every path to `node --experimental-strip-types --test` | 30 files, **309/309 passed**, no skips/cancellations. 305 inherited plus 3 recovery tests and 1 real-time smoke. Run once on final source. |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Exit 0. |
| Focused ESLint on component, resolver, recovery/transport/TLS tests, TLS support and fixture generator | Exit 0, no errors; one unused `_ms` test-clock parameter warning retained. |
| `npm run build` | Exit 0, optimized webpack build, TypeScript, SRI finalization and 2 static CSP hashes. |
| `npm run test:build` | Exit 0, static hash parity, nonce hydration/rotation, dashboard/auth/Google/billing boundaries, OG image and production Campaign Lab page/generation gates. |
| Existing `verify-brand-review-exports.mts` on four retained packages plus fresh recovery, with `--expect-accent=#123456` for the two override packages | Exit 0 for both invocations; hashes/lengths/references, exact product/offer/destination, packshot/alt, palette and revision/HTML agreement. |
| `.local/audit-recovery.mjs` | Exit 0; all five packages' facts/action/brand/rights/attestations/authority flags, font notices/references and static recipe checked. |
| `git diff --check` | Exit 0. |

Exact commands, runtime, raw-log hashes, original reviewer failure/isolated-pass
provenance and intermediate failures are in [verification.json](examples/brand-recovery/verification.json).
Raw logs remain in `.local/`; no broad rerun was used to seek green. Focused tests
were rerun only after fixture corrections. Original reviewer concurrent failure
was 287/288 with `0 !== 1`; its isolated pass remains distinct from this work.

The merged TLS suite uses real Windows Node/OpenSSL TLS engines, SNI, decrypted
Host and certificate rejection with injected DNS/wires/CA. Certificates require
real wall time after 2021-01-01 and before 2040-01-01; the expired leaf ends in 2021,
others in 2040. No fixture was regenerated. See the retained
[TLS matrix and boundaries](campaign-lab-brand-tls-qualification.md).

Artifacts:

- [Gallery, geometry, recovery observations and receipt](examples/brand-recovery/GALLERY.md).
- Fresh ZIP: `C:/Users/joser/Downloads/campaign-lab-fjord-works-field-notebook-d36c263b05.zip`.
- Fresh extracted exact export: `C:/Users/joser/.local/ornigami-brand-recovery/.local/recovery-export/`.
- Fresh receipt: `docs/examples/brand-recovery/receipt.json` (tracked copy, unchanged bytes).
- Retained packages: `C:/Users/joser/.local/ornigami-brand-review-apply/.local/{rose-export,rose-corrected-export,fjord-export,fjord-timeout-export}`.
- Rechecked revisions: `8b3a10b42f5a9785`, `ead895d89e720a2b`, `0cc39d127f53fbca`, `e209038f6d26c17b`; file counts 13, 4, 13, 13. Fresh recovery count 13.

Browser assistance was provided by the root agent using the Browser skill; no
subagents or customer participants. Late-read ordering is controlled in unit tests;
the normal browser covers failed file selection and external prop changes. At
375×812 and 1440×900 DOM viewport measurements matched, with client/scroll widths
360/360 and 1425/1425. The browser's scaled JPEGs encode 360×780 and 1425×891;
gallery labels distinguish viewport and bitmap. Keyboard focus reached correction,
Apply and CTA without horizontal overflow. The default evidence view is easier to
scan; the inherited heavy four-line desktop title remains a composition limitation.

Tool/startup failures are preserved: Turbopack could not resolve the dependency
junction; development webpack then exposed missing synthetic Google configuration.
Restarting development webpack with synthetic configuration resolved startup.
An automatic review rejected one combined shell edit/test command as “blocked by
policy”; a file-only patch and separate test commands completed that work. Disabled
Apply and summary locator attempts timed out; fresh accessibility/DOM inspection
provided the appropriate controls. No blocked production preview startup or direct
file playback was retried or bypassed. Production smoke is the existing controlled
gate, not a production Campaign Lab browser preview.

Remaining qualification: actual public URL/DNS/TCP/deployment egress, system trust
policy, other platforms/engines, native image isolation and native offline playback,
full typography/geometry extraction, source authenticity/owner/media rights, customer
usability and public product quality. No new animation or imported assets/fonts.
Archive audit and ordinary development preview do not establish offline playback.
The bounded local recovery goal is demonstrated; this grants no release permission.
