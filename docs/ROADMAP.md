# Roadmap

This roadmap reflects the current product direction rather than the older "all-in-one local SEO" framing.

## Current strategic center

The strongest current product story is:

1. Review Replies for handling Google reviews
2. Review Booster for generating more Google reviews after real visits
3. Agent-based billing and activation per business

Everything else in the repo should be evaluated relative to whether it strengthens that story.

## What is already in place

### Foundation

- Auth.js authentication
- Neon-backed user and business model
- Stripe checkout, portal, and webhook plumbing
- Public marketing and demo surfaces

### Review Replies

- Google Business Profile OAuth
- Location sync
- Review sync
- AI reply generation
- Draft save and post-to-Google flow
- Auto-reply toggle

### Review Booster

- Agent activation gate
- Settings flow
- Manual visit creation
- CSV upload with validation and dedupe
- Manual send trigger
- Cron send trigger
- Resend integration
- Visit and message persistence

## Immediate roadmap

### 1. Product alignment

- Unify branding between Ornigami and LocalLift
- Unify pricing story between public site and billing page
- Decide how much of the legacy content/audit product remains customer-facing

### 2. Review Booster polish

- Enforce the intended send timing window in backend logic, not just UI copy
- Expose clearer failure reasons in the Review Booster dashboard
- Improve onboarding so first-time users can launch Review Booster quickly
- Improve CSV usability and import feedback for non-technical users

### 3. Review Replies polish

- Tighten the reviews workflow and messaging
- Improve multi-location clarity
- Improve error and empty states around Google syncing

### 4. Operability

- Add observability and structured monitoring
- Add automated tests for the most important user flows
- Harden staging and release checklists

## Near-term product bets

### Bet A: Review Booster becomes the lead offer

Why it matters:

- clear value proposition
- easy to explain to local businesses
- directly tied to reputation growth
- less crowded than "generic AI content" positioning

Work that supports this bet:

- better onboarding docs
- better billing clarity
- better settings UX
- stronger public demo and sales material

### Bet B: Review Replies remains the operational anchor

Why it matters:

- it gives users a day-to-day reason to stay in the app
- it pairs naturally with Review Booster
- it deepens the Google review workflow moat

## Medium-term roadmap

- Connect Review Booster reporting more clearly to outcomes
- Add stronger business-level dashboards
- Improve multi-business or agency workflows
- Decide whether `speed_to_lead` should actually ship or be removed from the product story

## Lower-priority or legacy roadmap items

These may still be useful, but they are not the sharpest next move unless strategy changes:

- expanding the legacy content generator
- heavily expanding audit-centric positioning
- broad local SEO feature growth before the review agents are fully polished

## Success criteria for the next phase

The next phase should aim to make this statement true:

A new user can understand the product in five minutes, activate Review Booster without confusion, run a real campaign, and understand how Review Replies and Review Booster work together.
