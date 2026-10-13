# Free-service privacy launch plan

Prepared 13 October 2026. The owner requires every service to stay on a free tier and approved deferring paid OpenAI features for launch. This plan records the resulting dependencies; it does not authorize deployment, migration, paid usage or customer enrollment. Accepted company agreements and configured resources remain distinct from a verified deployed arrangement.

## Paid AI deferred

The prepared [server-side guard](../src/lib/openai-feature.ts) requires explicit `OPENAI_ENABLED=true` before any SDK call. Default, absent, false and invalid values prevent calls even when an API key remains configured. Reply generation and profile audits report `503 AI_UNAVAILABLE`; scheduled reply generation stops before acquiring a lease or reserving new usage. Booster follow-ups use existing static copy without transferring recipient or business input to OpenAI. Re-enabling requires a separately reviewed budget and company processing arrangement; it is not part of the free launch.

Integration must deploy and verify the guard on the actual target, keep the flag disabled and remove unnecessary deployed OpenAI credentials through its normal secret-management process. This worktree cannot establish that an older deployment has stopped making calls. Historical provider copies remain in the retention inventory even when future generation is deferred.

## Code verification

The final combined mocked run passed **47/47**, including nine guard tests. Coverage verifies no SDK construction/call or key lookup for disabled Booster generation, cached-client rechecks, default/false/invalid flag values, static fallback, explicit opt-in, lazy opt-in after module load, API unavailable responses, no lead writes or usage reservations, and unchanged enabled-path security/posting behavior. No live provider call was made. Typechecking (`npx tsc --noEmit`) and focused ESLint passed.

Reproduce the focused run:

```powershell
node --experimental-strip-types --test tests/a08-google-reviews.test.mts tests/a09-review-posting.test.mts tests/a09-routes-processing.test.mts tests/a12-provider-timeouts.test.mts tests/a06-booster-email.test.mts tests/a00-openai-feature.test.mts
```

No production build or deployment was run for this server guard; existing deployment linkage, provider copies and actual post-deployment no-call behavior remain unverified. The repository diff and private manifest checks cover evidence custody, not provider erasure or routing.

## Hosting candidate, not selected

[Vercel's terms](https://vercel.com/legal/terms) restrict Hobby to personal or non-commercial use. Its [DPA](https://vercel.com/legal/dpa) expressly covers Pro and Enterprise. The current Hobby observation therefore does not establish suitable commercial customer-processing coverage under the free-only requirement. Do not upgrade or represent that account as covered.

Cloudflare Workers is a candidate to assess. Its [Self-Serve Agreement](https://www.cloudflare.com/terms/), updated 12 September 2025, addresses Free Services and incorporates its DPA for applicable personal data. The [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) is version 6.4, effective 3 April 2026. These documents support investigating free company use; they do not establish an accepted Ornigami account or a fixed backup-erasure period. Company acceptance, applicable service terms, subprocessors/transfers and actual log/cache/residual-copy retention still require review.

[Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/) include 100,000 requests/day and 10 ms CPU per HTTP request and Cron Trigger. The [current Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) recommends vinext for Next.js 16, with other deployment paths documented separately. Existing Node route declarations are not proof of compatibility with Workers. Do not create a production account or change dependencies solely to claim privacy closure.

Source compatibility review must cover authentication, database access, cryptography, Sentry, server rendering, streaming and the privacy/Booster/reply schedules. Vercel Cron definitions in [vercel.json](../vercel.json) need equivalent authenticated execution after any migration; proxy-origin/IP trust controls also require target-specific review. Before selection, validate the actual application under the free CPU/memory/request limits, confirm hard no-charge behavior and prepare migration/rollback against existing data. No hosting migration was performed.

## Owner-selected future hosting

The owner plans **Contabo US East + Coolify** as final hosting in November 2026. No VPS/dashboard exists for review yet. Netlify setup is on hold; the assessment below remains an unselected reference. No purchase, account acceptance, migration or deployment was performed for either hosting path. The [VPS verification packet](./PRIVACY_VPS_VERIFICATION.md) covers actual company contracting, data locations, backup classes, retention and isolated restore evidence. Free software does not establish a free VPS; this task authorizes no server purchase or paid backup add-on.

## Netlify Free commercial-hosting candidate

Netlify's [Free-plan announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/) expressly permits commercial projects. Use its [current credit-plan documentation](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) for capacity rather than the announcement's older allowances: Free is US$0/month, 300 credits/month, with a hard limit and no recharge option. Its [plan comparison](https://www.netlify.com/pricing/personal-vs-free/) says projects pause when credits run out. This is a candidate for the owner's zero-budget constraint; availability under a hard cap still needs a workload assessment.

The [Next.js guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) describes support for modern Next.js through its OpenNext adapter, including App Router, SSR, route handlers and streaming. This supports assessing the existing application without a framework rewrite, but does not prove this project's build, authentication, cron, database, privacy controls or response-stream behavior on Netlify. Do not connect Git or deploy while merely reviewing account options.

The [Trust Center](https://www.netlify.com/trust-center/) supplied a 16-page DPA dated **9 June 2026**, retained privately as `public-review/netlify-dpa-reference.pdf`. It forms part of the applicable self-serve/enterprise agreement; section 2 covers processor/subprocessor roles, section 6 provides subprocessor handling, and section 14 includes SCC Modules Two/Three and UK transfer provisions. Section 12 addresses return/deletion without a fixed all-copy backup-expiry period. This is an unaccepted public reference, not an Ornigami agreement or evidence of account retention.

The [HTML self-serve agreement](https://www.netlify.com/legal/self-serve-subscription-agreement/) displays September 2020, while the [public PDF](https://www.netlify.com/pdf/self-serve-subscription-agreement.pdf/) identifies October 2025. Both tie capacity-related fees to the applicable plan description; the current Free credit description specifies a hard limit. Review the exact document and Free-plan terms linked at actual signup, applicable Terms of Use, optional add-ons and no-charge controls before acceptance. Do not assume that a public DPA reference or plan description alone creates the company's contract.

Netlify is an additional candidate for integration assessment, with no account, agreement acceptance, repository connection, resource migration or deployment performed. Actual log/cache/deploy/backup retention, subprocessors/regions and a tested migration/rollback remain required before connecting personal data. The known Vercel account stays separately inventoried.

## Further forwarding alternative

Cloudflare Email Routing remains a candidate, not a selected replacement. Its [official setup](https://developers.cloudflare.com/email-service/get-started/route-emails/) requires Cloudflare DNS and verified destinations, so using it would entail a separately reviewed DNS migration and preservation of existing application/sending records. Its [analytics documentation](https://developers.cloudflare.com/email-service/observability/metrics-analytics/) describes 31-day metrics retention with sender/recipient/subject/message identifiers; this is not a complete content/queue/backup erasure schedule. Review company acceptance, applicable service terms and remaining retention classes before any selection. The existing ImprovMX Free staging and owner-selected destination remain unchanged.

The three further provider inquiries are **unsent at the owner's request**. Continue with public/accessibly retained evidence; unresolved eligibility, class-specific expiry and actual target observations remain open. Do not silently replace them with assumed defaults or send another inquiry.

## Evidence still required

| Boundary | Current result | Required next evidence |
| --- | --- | --- |
| Contracting party | LLC formation and manager authority records retained privately | Actual company acceptance for each enabled vendor |
| Customer | Preparing for first customer; reusable draft exists | Completed actual provider/security annexes now; customer-specific scope and acceptance before processing that customer |
| Sentry | Company Developer/EU organization and DPA accepted; empty project staged with scrubbing/IP prevention on and minidumps disabled | Actual project linkage and data-class retention; old organization remains separate |
| Neon | Approved company Free organization created with service-terms/MCSA DPA incorporation; no projects | Separate DPA execution-copy review if required, actual target region/history and migration review before connecting data |
| ImprovMX | Owner completed signup; Free Active with no domains | Human Free-plan DPA/retention clarification, reviewed activation and original delivery receipts |
| Resend | Existing personal account Free; paid option abandoned; separate signup reported but not verified | Owner asks to reuse existing account: establish LLC contracting/DPA coverage and workload boundaries before connection |
| Receiving Gmail | Owner-selected existing inbox | Account custody, rights monitoring and actual retention handling; no Workspace DPA assumed |
| Stripe | Existing ES individual test identity | Owner-led LLC eligibility/verification and actual agreement before enabling customer billing; no transaction initiated |
| Backups/exports | Bounded inventory only; no verified application rotation | Actual destinations, access, expiry, legal exceptions and restore/erasure handling; do not claim the 35-day target is active |

DNS activation, route probes, migrations and deployment remain with integration under the original task boundary. Support correspondence remains limited to the specifically approved inquiries and follow-up. Human provider response times cannot be guaranteed; absent answers remain open evidence items. See the [closure record](./PRIVACY_EVIDENCE_CLOSURE.md), [company account packet](./PRIVACY_COMPANY_ACCOUNT_SETUP.md) and [routing handoff](./PRIVACY_ROUTING_HANDOFF.md).
