# Production activation — October 4, 2026

The user authorized continuing the next operator steps, selected the existing signed-in operator mailbox as the only recipient, and confirmed that no external consumer uses the A12 temporary Neon branch. Jose owns the local support credential and branch disposition. This record supersedes the pending activation statements in wave 11; it does not reopen its completed coding or isolated acceptance packages.

## Completed and independently checked

| Operation | Result and evidence boundary |
| --- | --- |
| Existing A10 email placement | Exact provider message `01a10759-49a2-7d42-8ed9-2ee1099668c0` found in Gmail **Promotions**, with original Message-ID matched to Resend and SPF/DKIM/DMARC passing. No resend of that message or CTA click. Its loopback links remain historical fixture links. |
| Permanent Resend configuration | One enabled webhook `31f7d0a0-b0eb-4e7d-8fd6-f2a4b207b7c9` at `https://ornigami.com/api/webhooks/resend`, subscribed to the seven implemented delivery event types. Signing secret installed as a sensitive **production-only** Vercel setting. Existing verified `reviews.ornigami.com` sender/reply-to and `https://ornigami.com` public application origin already matched and were preserved. |
| Deployed signing-secret binding | Correctly signed unsupported configuration probe returned 200/`unsupported_event`; incorrect signature returned 401. The unsupported type exits before a database/provider call. No isolated-only tool guard was changed or bypassed. |
| Actual permanent webhook transport | One direct-provider configuration email, only to the operator, ID `01a107ae-4884-7437-b256-726dbd9b478a`. Exact sent/delivered event payload IDs and recipients matched; each had one successful HTTP 200 attempt acknowledged as `unmatched_provider_event`. This proves deployed transport, not a production application send or ledger journey. |
| New operator mailbox receipt | Original Message-ID, recipient and subject matched the new Resend message in Gmail **Primary**. SPF/DKIM/DMARC passed; the public homepage link uses `https://ornigami.com`. No customer review/unsubscribe link was exercised. |
| Production support access | Fresh Vercel configuration pinned the existing production database; bounded read-only preflight passed on PostgreSQL 17.11. Client TLS verified by `psql` connection information. Applied the existing guarded `A12_SUPPORT_ACCESS.sql`, activated the dedicated reader and delivered a current-user-only credential outside Git. Independent production verifier passed: feedback SELECT only, no other persistent table/sequence access, mutation/grant rights, memberships, escalation or callable non-system SECURITY DEFINER access. Private inbox artifact returned zero rows. PostgreSQL's default TEMP privilege is recorded, not persistent application access. |
| Current Sentry email action | Organization membership showed only the operator. Clicked **Send Test Notification once** from current alert editor `746029`, project `4511869152526416` / `sentry-pink-lantern`. Mailbox received sample issue `151266901`, event `66b03cc5fe9347999d2008a1675e7f01`. Email identifies test rule `-1`. This accepts the editor's email action transport only; it does not prove the production high-priority trigger or map historical rule `760684`. No alert configuration was saved or changed. |
| Temporary Neon branch lifecycle | Project `bitter-brook-23785103`, child `br-noisy-shape-aly2lr5p` / `a12-support-access-20261004`, parent `br-red-frost-alc3smfv`. Saved and independently read back expiry **2026-10-05 18:00:00 Europe/Madrid** / **16:00:00 UTC**. Disabled the child-only reader and removed its private local credential; independently confirmed production reader still LOGIN. The branch is scheduled to expire, not already deleted. Historical sanitized evidence remains independent of the child. |

Production redeployment `dpl_56zv24YzyFeQwuN5sCpgBzRYvkCK` is Ready for exact main commit `5fbbd1e41ac047fd78ec0f5e6c876696d4e19bcc`, and the `ornigami.com` alias matches. All 21 public/gated boundary checks passed; the Resend boundary now correctly returns 401 for an unsigned request instead of missing-secret 503. A later documentation deployment is recorded separately in the final private receipt.

The direct-provider mail created no customer visit, delivery, event or suppression. Before/after counts matched: one existing visit, zero delivery rows, zero delivery events and zero suppressions. Account deletion and manual provider reconciliation remain disabled. Existing authentication-secret fallbacks were preserved; no token/signing-key rotation was introduced. The support credential is **operator-only**, absent from application/Vercel configuration. This was a guarded support-role operation, not a new numbered schema migration.

Read-only cron inspection at 16:11 UTC found no active alerts, privacy retention succeeded, and Booster/Replies last outcomes were `no_work`. Earlier hourly GitHub health failures are historical observations; this current condition is not a claim that the next scheduled monitor has passed. No health evaluator, cleanup or cron was manually invoked to test it, and the accepted October 4 privacy observation was not repeated.

## Private operator artifacts

Sanitized CLI/provider receipts are outside Git under `C:/Users/joser/Desktop/Projects/Ornigami-Backups/2026-10-04-production-activation`. Credential and signing-secret artifacts are restricted to the current Windows account under LocalAppData. Temporary full production configuration/admin sources are removed after verification. No secret, mailbox locator, customer feedback or raw message body belongs in repository evidence.

The production support credential is in `C:/Users/joser/AppData/Local/Ornigami/support-access/production-20261004/support.env`, with private local operator instructions. Load it only into the support process, for example:

```powershell
node --env-file='C:/Users/joser/AppData/Local/Ornigami/support-access/production-20261004/support.env' scripts/support-inbox.mjs --limit 25
```

Run from the canonical repository with its installed dependencies. Output stays in a private local inbox artifact. A separate device/operator requires separately provisioned access rather than moving the credential into deployment settings. The original child credential has been revoked and removed. No physical-overwrite claim is made.

## Remaining work — no preparation restart

1. **Bounded release journeys using existing tooling:** publicly reachable review/unsubscribe links from an actual application send, mail-based verification/reset, and the remaining explicitly unperformed CSV/send/concurrency/recovery journeys; exact deployment authenticated performance/CSP report review; one controlled application error with sanitized Sentry capture and current high-priority trigger/recipient correlation. The operator mail and Sentry editor sample are configuration/action proofs and must not be relabeled as these journeys. Use an authorized isolated target or the agreed pilot, without customer data fixtures.
2. **Owner/external gates:** Stripe acceptance stays skipped until the user changes that scope; paid billing is still unproved. Review Replies waits for a real eligible client profile/Manager access and Google approval/quota evidence. No repeat A16 preparation without those inputs. Remaining A18 commercial choices and A11/A10 retention/deletion/suppression decisions still require owner decisions; account deletion stays disabled.
3. **Release decision:** A00 consumes the specific remaining receipts and records pilot scope/rollback. A17 can own those bounded journeys when targets and scope are available, with A12/A19 only for a concrete failed criterion. A15 legacy cutover and A14 lead expansion remain outside the current Booster pilot. No broad A01/A10/A12/A16/A17/A19/A20 session is assigned.

## Operational rollback

If needed, disable only the receipted permanent webhook and remove its production setting, then redeploy the approved main revision. Preserve its private signing secret/creation receipt until provider state is reconciled; do not create a second endpoint blindly. Support rollback is NOLOGIN for the exact production reader followed by credential removal only after state verification, without shared grant repair. The branch expiry is intentionally scheduled and no immediate production branch deletion is authorized. Historical email and test issue facts are independent of code rollback.

Provider event/attempt checks use the documented [Resend event retrieval](https://resend.com/docs/api-reference/webhooks/get-event) and [attempt retrieval](https://resend.com/docs/api-reference/webhooks/list-event-attempts) APIs. Their payload/recipient matching and HTTP acknowledgements are retained as sanitized private receipts.
