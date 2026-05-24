# Contributor Notes

This file is a short set of repository-specific contributor reminders.

## Current product understanding

The repo is no longer best described as a broad local SEO toolkit. The current center of gravity is:

- Review Replies
- Review Booster
- Business-level agent activation

When making product or engineering decisions, optimize first for the clarity and reliability of those flows.

## Architecture reminders

- Keep feature logic separated by concern.
- Prefer shared app logic in `src/lib`.
- Keep Review Booster-specific behavior inside `src/modules/review-booster` when practical.
- Be careful with cross-cutting changes because billing, auth, Google sync, and Review Booster all touch shared business state.

## Product consistency reminders

- The repo still contains mixed `Ornigami` and `LocalLift` branding.
- The repo still contains mixed pricing models in UI copy.
- Do not assume public-site messaging is fully aligned with billing behavior.

## Security reminders

- Agent access is enforced in application code; do not bypass those checks.
- Review Booster cron must stay protected by `CRON_SECRET`.
- Google, Stripe, OpenAI, and Resend secrets must remain server-only.
- Validate all user input, especially CSV imports and externally-triggered routes.

## UX reminders

- For customer-facing work, keep the experience simple for non-technical local-business users.
- Review Booster onboarding and setup clarity should be treated as especially important.
- Avoid adding new complexity to legacy surfaces unless they clearly support the main product story.

## Quality reminders

- Test real flows, not just isolated helpers.
- Pay close attention to empty, loading, and failure states.
- If behavior described in UI copy is not enforced in backend logic, treat that as a product bug.
