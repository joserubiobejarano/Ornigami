# Google Business Profile Runbook

This runbook tracks the external Google gates for Ornigami Review Replies. Console observations are evidence only for the date and account recorded; a later operator must recheck live state before treating any gate as complete.

## Project and evidence status

The repository is configured around this Google Cloud project:

| Field | Recorded value | Evidence status |
| --- | --- | --- |
| Project name | `Local-Lift` | Confirmed in Cloud Console on 2026-10-03. |
| Project ID | `local-lift-477812` | Confirmed in Cloud Console on 2026-10-03. |
| Project number | `1002660087913` | Confirmed in Cloud Console on 2026-10-03. Reconfirm selected project before a future submission. |

A Console audit recorded on **2026-08-16** reported zero quota for the My Business Account Management API and My Business Business Information API, the Google My Business API absent from the enabled API inventory, an External/Production OAuth consent screen with `business.manage`, both production callbacks, localhost callbacks, and a branding warning. It also found no GBP profile linked to the particular account used in that audit; that did not establish the eligibility of every account or client profile.

A fresh read-only Console audit by the release owner on **2026-10-03** observed the current state below. These are point-in-time Console observations, not application or provider acceptance:

- Project `Local-Lift` / `local-lift-477812` has the My Business Account Management API and My Business Business Information API enabled; both show **0 Requests per minute**. Supporting GBP APIs are enabled. Google My Business API is absent from the enabled inventory.
- OAuth audience is **External** and publishing status is **Production**. The Ornigami Web client has both production callbacks and their `localhost:3000` counterparts registered.
- The configured GBP scope is `business.manage`; Console currently classifies it as **non-sensitive**. Sensitive and restricted scope lists are empty, and the Verification Center says data-access verification is **not required for the current scopes**.
- Branding status is **not displayed/verified**. The prior verification issue says `https://ornigami.com` homepage is not registered to the applicant's name. Google Console instructs the operator to verify ownership, wait 24 hours, then retry branding verification. The app name is Ornigami, expected home/privacy/terms URLs are present, and `ornigami.com` is listed as an authorized domain. In the Search Console property selector, `ornigami.com` is missing; domain ownership is therefore not established in the checked account.
- The user reports no active GBP currently available for this work. No eligible client profile or applicant Manager access has been supplied or verified. This is an external eligibility dependency, not a finding that no client profile could qualify.
- No Console settings were changed and no application was submitted in this audit.

Do not carry forward 2026-08-16 statements as the current state where they conflict with these observations. Current applicant/profile eligibility remains unverified. Billing and contact details were not included in the audit and remain unknown.

The current 0 QPM values for the enabled Account Management and Business Information APIs indicate those API quotas are not usable yet. Google says a GBP API quota of zero means access has not yet been granted. The published default is 300 QPM for Account Management and Business Information APIs, but each API's live quota must be read separately. Direct Cloud Console links for the recorded project: [Account Management quotas](https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=local-lift-477812), [Business Information quotas](https://console.cloud.google.com/apis/api/mybusinessbusinessinformation.googleapis.com/quotas?project=local-lift-477812), and [Google My Business quotas](https://console.cloud.google.com/apis/api/mybusiness.googleapis.com/quotas?project=local-lift-477812) (the latter may be inaccessible until the service is available/enabled). A quota increase is a later capacity request; it does not replace Basic API Access when quota is zero. Google specifically says to submit **Application for Basic API Access** when quota is zero and not a quota-increase request. See [usage limits](https://developers.google.com/my-business/content/limits).

## Gate 1: applicant manages an eligible real profile

Google's prerequisite is to **manage a Google Business Profile that is verified and active for 60+ days**. It may be the applicant's own location or a client's profile. The 60-day wording describes the profile's verified-and-active duration; Google's published prerequisite does not say the applicant must personally have held Manager access for 60 days. The applicant must currently manage it and should be able to demonstrate that profile's eligibility. Google also requires the business website to be listed on the qualifying profile. The release owner reports that no active GBP is currently available; consequently there is no eligible profile confirmed for this application. Use a real client profile only with the client's permission; never create a synthetic Ornigami listing. [Google prerequisites](https://developers.google.com/my-business/content/prereqs)

If the client agrees to provide access, ask the profile's owner (or another person with permission to manage users) to invite the applicant's Google Account as a **Manager**:

1. Open the real profile in Google Search/Maps or [Business Profile Manager](https://business.google.com/locations).
2. Open **Business Profile settings → People and access → Add**.
3. Enter the applicant's Google Account email, choose **Manager**, and send the invitation.
4. The applicant accepts the invitation and confirms that the profile appears in their account. Keep the client as owner; do not request the client's password or ownership transfer.
5. Record privately, with the client's consent, the profile identity, verified/active evidence and relevant dates needed to establish 60+ days. Do not put client name, profile URL, personal email, or screenshots in this public repository.

Google documents Manager access and the invite flow in [Manage Business Profile owners and managers](https://support.google.com/business/answer/3403100). The prior audit's finding that one Google account had no linked profile is not a current eligibility check.

## Gate 2: request Basic API Access for the project

After confirming the qualifying profile, use the [GBP API contact form](https://support.google.com/business/contact/api_default) while signed in to the applicant Google Account and select **Application for Basic API Access**. Google prerequisites say to select the intended Cloud project and provide its project number. Keep the product website/contact details accurate and consistent with the project. The qualifying client's website is evidence for profile eligibility; Ornigami's public site is the product website in the application. Do not substitute one for the other.

The form and its fields can change. Prepare the answer draft and unknowns in [A16 Google approval packet](./tasks/A16_GOOGLE_APPROVAL_PACKET.md); fill private contact, profile, and account fields from current first-party evidence immediately before submitting. No form has been submitted as part of this documentation work.

Basic API Access, API enablement, and quota capacity are separate checks:

1. Google reviews the project access application. Retain the response/approval evidence.
2. In the same selected Cloud project, enable the needed Business Profile APIs after approval. The reviews/replies API is shown as **Google My Business API**; Google says it is visible only to users who have submitted the access form and been approved. Other APIs have separate services, such as **My Business Account Management API** (`mybusinessaccountmanagement.googleapis.com`) and **My Business Business Information API** (`mybusinessbusinessinformation.googleapis.com`). The legacy reviews service is `mybusiness.googleapis.com`. API display names and service IDs are not interchangeable; record the enabled display name and service ID from the project. See [Basic setup](https://developers.google.com/my-business/content/basic-setup) and the [API reference](https://developers.google.com/my-business/reference/rest).
3. Inspect quota for each enabled API. A zero quota means access is still not available; a nonzero quota is required for live calls. If the approved allocation later proves insufficient, submit a separate quota-increase request with usage rationale. Do not assume every API has identical quota or that approval by itself proves the services are enabled.

## Gate 3: OAuth branding, domain, scope, and publication

Project API approval does not verify or publish Ornigami's OAuth consent screen. These are separate Google processes and must be checked in Google Auth Platform for the same project:

- Verify the current app name, logo, public home page, support email, developer contacts, privacy policy, terms, and authorized-domain list. The home page must be publicly accessible and accurately describe the app. The current branding status is not verified/published because the domain ownership prerequisite failed.
- Verify ownership of every authorized top private domain in Google Search Console. Google's branding guide requires a Google Account with **Owner permissions for the domain** to be associated with the Cloud project (as a project Owner or Editor). In Search Console, Owner can be **verified** or **delegated**; Full and Restricted users do not qualify. The 2026-10-03 branding check reports that Google does not recognize `ornigami.com` as registered to the applicant and instructs the operator to verify ownership, wait 24 hours, then retry. The checked Search Console account's property selector has no `ornigami.com` property; ownership is not established for that account. If the authorized operator controls DNS, a Search Console Domain property for `ornigami.com` can be verified with a DNS record and covers subdomains. Otherwise, an existing property Owner may add the applicant's Google Account specifically as a **delegated Owner**, or the applicant can verify an eligible URL-prefix property using a method Search Console offers. Domain properties require DNS verification; URL-prefix properties support multiple methods. Use an account with Search Console Owner permissions and associate that same account with the Cloud project. No DNS, website, or Console change is part of this runbook update. See [OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Search Console ownership verification](https://support.google.com/webmasters/answer/9008080), [property types](https://support.google.com/webmasters/answer/34592), and [Search Console owners, users, and permissions](https://support.google.com/webmasters/answer/7687615).
- Confirm the requested GBP scope is exactly `https://www.googleapis.com/auth/business.manage` and that every actual scope is declared under Data Access. Google describes this GBP scope as managing a Business Profile. On 2026-10-03 Console classified it as non-sensitive, showed no sensitive/restricted scopes, and said data-access verification is not required for the current scope set. Recheck if scopes change; do not assume project API approval is OAuth brand verification.
- For an External app offered to arbitrary Google users, publish branding after successful brand verification. If the scope is marked sensitive or restricted, complete the corresponding data-access verification too. “Published” status by itself does not mean scope verification passed. Testing status is limited to explicitly listed test users and carries Google's testing limits. Follow [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), and [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).

The repository's production callback paths are:

```text
https://ornigami.com/api/auth/callback/google
https://ornigami.com/api/google/oauth/callback
```

On 2026-10-03, the reviewed Ornigami Web client showed both production callback strings and both `localhost:3000` counterparts registered. For future release acceptance, pair the deployed `NEXT_PUBLIC_APP_URL` and Auth.js base URL behavior with the correct deployed OAuth client and confirm each runtime `redirect_uri` exactly matches its registered URI. Google requires production web callbacks to use HTTPS and a domain the app owns or is authorized to use. Localhost HTTP is allowed for local development. This dated Console observation does not prove deployed client pairing or runtime behavior; no URI removal is proposed by this task. See [web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

The repository also has an offline local-configuration check: [A16 Google readiness checker](../scripts/a16-google-readiness.mjs), with behavior and limits documented in [A16 OAuth configuration](./tasks/A16_OAUTH_CONFIGURATION.md). Run `node scripts/a16-google-readiness.mjs` locally, or `node scripts/a16-google-readiness.mjs --json --environment production` for sanitized production-shape findings. It reads process environment only and makes no network/provider calls. A clean result checks local settings against application code; it does not prove Console registration, deployed client pairing, API access, quota, branding, or profile eligibility.

## Gate 4: real authorized-client acceptance

Once project access, the required APIs/quotas, OAuth publication and any required scope verification are confirmed, obtain separate authorization from a real client for a controlled test. Project approval does not authorize access to any client's profile. The client must grant the Google user access to its profile, then a user must complete Ornigami's OAuth consent for `business.manage`.

Use an explicitly agreed client profile and a controlled review. Record the target and permission scope privately before any mutation. Validate in order:

1. OAuth completes on the registered production callback and persists encrypted credentials.
2. Account/location discovery returns only resources available to that consenting account; select the agreed location.
3. Sync a real review and verify its identity/location in Ornigami.
4. Generate and save a draft, preserving the exact reviewed text and version.
5. With the client's explicit approval for the specific review and exact reply, post one controlled reply and verify the provider result. Do not test posting on a client's live profile without that approval.
6. Run the scheduled sync/draft path and verify it does not post replies automatically. Confirm the Booster review URL is derived from the synced location, while preserving any configured manual URL.

Use [A17 acceptance](./tasks/A17_ACCEPTANCE_MATRIX.md) to record isolated, authenticated-browser, and real-provider evidence as distinct levels. Mocks, route tests, API enablement screenshots, and OAuth sign-in tests do not establish real-provider acceptance.

## Current evidence ledger

Record only dated, attributable evidence. Mark unavailable values **Unknown** and have the responsible operator fill them from the live Console or account; never infer from the previous audit.

| Gate | Current result | Evidence to retain privately | Owner/status |
| --- | --- | --- | --- |
| Eligible verified-and-active 60+ day profile; applicant currently Manager | No eligible profile confirmed; user reports none currently available. Client profile/applicant access unknown. | Client consent, profile state/date, accepted Manager invite | Blocked on eligible real profile |
| Basic API Access submitted / decision | Not submitted; current 0 QPM is consistent with Google's instruction to apply for Basic API Access first. | Project number used, submission date, Google response | Do not submit until eligible profile and application fields are confirmed |
| APIs enabled and service IDs | 2026-10-03: Account Management and Business Information enabled; supporting GBP APIs present; Google My Business API absent. | Selected project, enabled API display names/service IDs | Recheck after approval |
| Per-API quotas | 2026-10-03: Account Management 0 QPM; Business Information 0 QPM. | Timestamped quota values for each service | Read-only Console audit; no quota request submitted |
| OAuth branding/domain/scope verification/publication | 2026-10-03: External/Production; branding not verified due to homepage ownership mismatch; `business.manage` non-sensitive; data-access verification not required for current scopes. Search Console property selector has no `ornigami.com` property in the checked account. | Search Console ownership, then branding verification retry after 24 hours | Domain ownership remains open |
| Both production callbacks | 2026-10-03: both required production callbacks present on Ornigami Web client; localhost:3000 counterparts also present. | OAuth client identity and exact registered URI list | Root Console audit; verify against deployed URL |
| Controlled real profile OAuth/discovery/sync/draft/post/cron/URL | Blocked pending preceding gates and client authorization | Sanitized A17 acceptance receipt | A17 after A16 gates |

Do not store client names, emails, profile identifiers, access tokens, OAuth secrets, raw provider payloads, or screenshots with private client data in this repository. Keep a sanitized evidence reference, date, project identity, status, and owner here and retain supporting material in the approved private evidence location.

## Sources

- [GBP API prerequisites](https://developers.google.com/my-business/content/prereqs)
- [GBP API basic setup](https://developers.google.com/my-business/content/basic-setup)
- [GBP API usage limits](https://developers.google.com/my-business/content/limits)
- [GBP API contact form](https://support.google.com/business/contact/api_default)
- [Business Profile owners and managers](https://support.google.com/business/answer/3403100)
- [OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [OAuth sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [OAuth web-server flow and URI validation](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Search Console owners, users, and permissions](https://support.google.com/webmasters/answer/7687615)
- Repository [project scope](./PROJECT_SCOPE.md), [roadmap](./ROADMAP.md), [A08 Google integration handoff](./tasks/A08-google-integration.md), [A17 acceptance matrix](./tasks/A17_ACCEPTANCE_MATRIX.md), and [deployment checklist](./DEPLOYMENT_CHECKLIST.md).
