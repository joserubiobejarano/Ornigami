# Google Business Profile Runbook

This document records the current Google Business Profile (GBP) access state for Ornigami and the exact sequence required before real Review Replies onboarding.

## Current state: blocked before real-profile validation

As of 2026-08-16, the Google Cloud project used by the repository is:

- Project name: `Local-Lift`
- Project ID: `local-lift-477812`
- Project number: `1002660087913`

The Cloud Console audit found:

- The current Google account is a project Owner, but it is not linked to a Google Business Profile.
- Ornigami is an online-only SaaS product. Do not create a Business Profile for Ornigami solely to unlock API access; online-only businesses are not eligible for GBP listings.
- My Business Account Management API is enabled, but its Requests per minute quota is `0`.
- My Business Business Information API is enabled, but its Requests per minute quota is `0`.
- Supporting GBP APIs are enabled, including Notifications, Place Actions, Q&A, Verifications, and Business Profile Performance.
- Google My Business API, which provides the reviews and replies functionality used by Ornigami, is not available in the project’s enabled API inventory.
- OAuth is in production with external users. The `business.manage` scope is configured.
- Both production redirect URIs are present, along with localhost redirect URIs:
  - `https://ornigami.com/api/auth/callback/google`
  - `https://ornigami.com/api/google/oauth/callback`
  - `http://localhost:3000/api/google/oauth/callback`
  - `http://localhost:3000/api/auth/callback/google`
- The OAuth configuration has a branding-status warning. The app name, support email, website, privacy policy, terms, and `ornigami.com` authorized domain are present, but brand verification/domain ownership should be completed before broad onboarding.
- No Cloud Billing account is linked. This is not the cause of the GBP quota being `0`.

The decisive blocker is Google Business Profile API access approval. Enabling the API switches without approval does not provide usable quota. A `0 QPM` quota means the project has not been approved; approved projects should show the standard quota, currently documented as `300 QPM`.

## What must happen next

### 1. Obtain access to an eligible real Business Profile

Because Ornigami is online-only, do not create an Ornigami Business Profile.

Ask a real client with a verified, active Business Profile to add the Google account that will submit the application as a Manager. The client can do this in Business Profile Manager:

1. Open [Google Business Profile Manager](https://business.google.com/locations).
2. Select the client profile.
3. Open **Business Profile settings**.
4. Open **People and access**.
5. Add the applicant’s Google account as a **Manager**.

Google’s API prerequisites require the applicant to manage a verified, active profile for at least 60 days and to have a live business website. A client profile is acceptable; a fake or test listing is not.

### 2. Submit the GBP API access request

After the account has access to the client profile:

1. Open the [Google Business Profile API Support form](https://support.google.com/business/contact/api_default).
2. Select **Application for Basic API Access**.
3. Use the Google account that is an owner or manager of the eligible profile.
4. Provide project number `1002660087913` and project ID `local-lift-477812`.
5. Describe Ornigami accurately: it connects business owners through OAuth, reads authorized locations and reviews, generates reply drafts, and posts replies only for profiles the user authorizes.
6. Use the live product website and matching support/developer contact details.
7. Submit the form and retain the confirmation email.

Do not submit a normal quota-increase request while the quota is `0`. First request Basic API Access. Google reviews the access request separately from ordinary quota adjustments.

### 3. Wait for approval and verify the project

After Google responds:

1. Reopen the API quotas for the My Business Account Management API and My Business Business Information API.
2. Confirm the Requests per minute quota is no longer `0`.
3. In **APIs & Services → Library**, search for and enable **Google My Business API** if it becomes available.
4. Confirm its quota is also non-zero.
5. Record the approval date, confirmation email, API services enabled, and observed quotas in the deployment checklist.

If Google rejects the request, confirm that the applicant account manages an eligible 60+ day profile, the profile is verified and active, the website is live, and the application describes a legitimate third-party use case. Reapply only after correcting the failed prerequisite.

### 4. Finish OAuth and branding readiness

Before broader customer onboarding:

- Verify ownership of `ornigami.com` through Google Search Console if the OAuth branding warning remains.
- Return to **Google Auth Platform → Branding** and clear the branding-status warning.
- Keep the app in production and keep the `business.manage` scope and redirect URIs aligned with the deployed environment.
- Do not add broader scopes unless the product genuinely needs them.

## What happens once a real client profile is available

The sequence is:

```text
Client grants Manager access
        ↓
GBP API Basic Access request is submitted for project 1002660087913
        ↓
Google approves access and quotas become non-zero
        ↓
Google My Business API is enabled
        ↓
Client signs in through Ornigami and authorizes business.manage
        ↓
Ornigami lists accounts and locations
        ↓
Ornigami syncs locations and reviews
        ↓
User generates and saves a reply draft
        ↓
User posts one controlled reply
        ↓
Cron sync/draft and optional auto-reply are verified
```

Important distinctions:

- Google Cloud project approval is project-level and does not grant access to every Business Profile.
- Each client must still authorize Ornigami through OAuth and must have access to the specific profile.
- Manager access is sufficient for normal third-party management; the client should remain the primary owner.
- The app should test a controlled reply before enabling any automatic posting behavior.

## Validation possible before approval

The live GBP read/reply path cannot be validated until the approval and quota steps succeed. Development can continue with:

- mocked location and review payloads;
- OAuth redirect and callback tests;
- encrypted token storage and refresh handling;
- AI reply generation and draft persistence;
- database tenancy and plan gating;
- Review Booster with a manually entered Google review URL;
- controlled tests for cron, error handling, and rate-limit behavior.

## Source documentation

- [Google Business Profile API prerequisites](https://developers.google.com/my-business/content/prereqs)
- [Google Business Profile API basic setup](https://developers.google.com/my-business/content/basic-setup)
- [Google Business Profile API FAQ](https://developers.google.com/my-business/content/faq)
- [Google Business Profile eligibility rules](https://support.google.com/business/answer/13763036)
- Repository [deployment checklist](./DEPLOYMENT_CHECKLIST.md)
- Repository [roadmap](./ROADMAP.md)
