# Next Steps

This is the practical short list for the next maintainer or product owner.

## Top priority

### 1. Make Review Booster the cleanest experience in the app

Why:

- It is the clearest current growth offer.
- It has the best chance of being sold and demoed quickly.
- It already exists end to end, so polish work has immediate leverage.

Do next:

- Enforce the intended follow-up timing rule in backend selection logic.
- Surface send failure reasons in the dashboard.
- Simplify settings copy for non-technical users.
- Improve the first-run experience after activation.

## Product alignment work

### 2. Resolve brand and pricing drift

Do next:

- Choose whether the product is officially `Ornigami`, `LocalLift`, or a transition with a clear rule.
- Align homepage, pricing, billing page, and docs.
- Decide whether pricing is single-plan, per-agent, or hybrid.

## Reliability work

### 3. Add tests and observability around the core flows

Do next:

- Add automated coverage for auth, billing webhook behavior, Review Replies sync/post flow, and Review Booster upload/send flow.
- Add production monitoring and alerting.
- Make release verification easier and faster.

## Product cleanup work

### 4. Decide what to do with legacy surfaces

Do next:

- Decide whether `/content` stays, gets hidden, or gets removed.
- Decide whether audit pages remain a supporting acquisition funnel.
- Remove or relabel product copy that no longer matches the main offer.

## Medium-term product exploration

### 5. Decide the fate of `speed_to_lead`

Questions to answer:

- Is it a real next product?
- Does it belong in this app?
- Is it only a placeholder that should be removed from billing and navigation stories for now?

## Suggested execution order

1. Review Booster polish
2. Brand and pricing alignment
3. Test and monitoring coverage
4. Legacy-surface cleanup
5. Future-agent strategy

## Useful files to start with

- `src/app/(dashboard)/dashboard/agents/review-booster/page.tsx`
- `src/app/api/review-booster/settings/route.ts`
- `src/app/api/review-booster/upload/route.ts`
- `src/modules/review-booster/services/followup-runner.service.ts`
- `src/modules/review-booster/services/review-booster-db.service.ts`
- `src/app/(dashboard)/dashboard/billing/page.tsx`
- `src/app/pricing/page.tsx`
