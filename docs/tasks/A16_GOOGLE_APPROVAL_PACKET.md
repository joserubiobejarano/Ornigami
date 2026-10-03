# A16 — Google Business Profile approval packet

Status: application prepared as a draft only. No support form was submitted, no Console configuration changed, no client profile was accessed, and no live Google API call was made for this packet.

Baseline: `b4eedd5385f2aa1ce93a48ba7a5c15337f120ede` (`ops/google-launch-approval`), 2026-10-03.

## Gate status from the 2026-10-03 Console audit

| Gate | Observed status | Meaning / next evidence |
| --- | --- | --- |
| Cloud project | `Local-Lift`, ID `local-lift-477812`, number `1002660087913`; all three confirmed in Cloud Console on 2026-10-03 | Reconfirm selected project before a future filing. |
| Basic GBP API access | Not recorded as approved; Account Management and Business Information each show 0 QPM | Google says zero quota means access has not been granted; the correct next form type is Application for Basic API Access, not quota increase. Application is not ready to submit until the applicant manages a qualifying real profile and unknown fields are resolved. |
| API enablement | Account Management, Business Information, and supporting GBP APIs enabled; Google My Business API absent | After access approval, check Library visibility and enable the reviews/replies service if available. Record actual service IDs and per-service quota. |
| Eligible profile / applicant access | User reports no active GBP currently available; no eligible client profile or applicant Manager access has been supplied or verified | Blocked. A client-owned profile is acceptable if it is verified and active for 60+ days, its website is listed, and the applicant currently manages it. Do not create a test listing. |
| OAuth audience and publication | External; Production | Current audience/publication state observed in Console; recheck before launch. |
| OAuth scope / data-access review | `business.manage` currently classified non-sensitive; sensitive and restricted tables empty; Verification Center says data-access verification not required for current scopes | Applies only to the current declared scope set. Recheck after scope changes. This is separate from API project approval and branding verification. |
| OAuth brand | Not verified/published as branded; current issue says `https://ornigami.com` homepage is not registered to the applicant's name | Search Console property selector in the checked account has no `ornigami.com` property; ownership is not established for that account. The verifying account needs Search Console **Owner** permissions (verified or delegated) and must be associated with the Cloud project as Owner or Editor. Full/Restricted Search Console access is insufficient. Verify ownership, wait 24 hours per Console guidance, then retry branding. |
| OAuth client callbacks | On 2026-10-03, reviewed Ornigami Web client showed both production callbacks and localhost:3000 counterparts | Future release acceptance must pair deployed URL behavior with the correct deployed OAuth client. No callback changes or removals were made. |
| Client OAuth authorization / provider acceptance | Not done | Requires client authorization after the external project and OAuth gates. |

Direct Cloud Console quota links for this project: [Account Management](https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=local-lift-477812), [Business Information](https://console.cloud.google.com/apis/api/mybusinessbusinessinformation.googleapis.com/quotas?project=local-lift-477812), and [Google My Business](https://console.cloud.google.com/apis/api/mybusiness.googleapis.com/quotas?project=local-lift-477812). The last link may not be accessible until Google makes that service available and it is enabled. The recorded 0 QPM values are from the release owner's read-only 2026-10-03 Console audit; no live calls were sent.

These Console findings are dated observations, not proof of app-level behavior or provider acceptance. The applicant's GBP eligibility is unverified. The user reports no active profile currently available, which does not establish that no eligible client profile exists; no client profile or consent has been provided. Historical audit details and exact current observations are also summarized in the [runbook](../GOOGLE_BUSINESS_PROFILE_RUNBOOK.md).

## Eligibility and Manager access instructions

Google's official prerequisite says the applicant must **manage a GBP that is verified and active for 60+ days**; it may belong to a client. It separately says the website representing the business must be listed on the qualifying profile. Read literally, the 60 days describes the profile's verified-and-active state. The prerequisite does not state that the applicant must have held Manager access for 60 days, but the applicant must currently manage the qualifying profile. Confirm any additional evidence Google requests in the form or follow-up. Source: [GBP API prerequisites](https://developers.google.com/my-business/content/prereqs).

If a real client agrees, the profile owner can invite the applicant's Google Account as a Manager:

1. Owner opens the correct profile and chooses **Business Profile settings → People and access → Add**.
2. Owner enters the applicant's Google Account email, chooses **Manager**, and sends the invite.
3. Applicant accepts it and confirms the profile is accessible in their own account.
4. With client consent, privately record that the profile is verified and active 60+ days, its listed website, and the accepted Manager access. Keep the client as owner. Never ask for a password, ownership transfer, synthetic listing, or public-repository copy of client identifiers.

Google's [owners and managers guide](https://support.google.com/business/answer/3403100) confirms managers can edit profile information and respond to reviews; only owners can add/remove users. Client access is a qualification and later client authorization dependency; it is not Google Cloud project approval and does not grant Ornigami OAuth consent.

## Draft: Basic API Access application

Use the [Google Business Profile API contact form](https://support.google.com/business/contact/api_default), select **Application for Basic API Access**, and use the Google Account that currently manages the qualifying profile. Google asks the applicant to select the intended project and provide its project number. Form wording can change, so map this draft to the live fields rather than pasting mechanically. Do not submit until the eligibility and unresolved fields below are verified.

### Project and product facts to enter after rechecking

| Form fact | Draft value | Required check |
| --- | --- | --- |
| Project | Ornigami Google Cloud project, currently recorded as `Local-Lift` / `local-lift-477812` | Verify in Console project selector. |
| Project number | `1002660087913` | Verify on selected project's dashboard immediately before application. |
| Applicant Google Account | `[FILL: applicant account currently managing the eligible profile]` | Private value; never put it in this repository. |
| Applicant profile | `[FILL: client profile identity and evidence of verified/active 60+ day status]` | Private; client consent required. Use profile's listed business website as eligibility evidence. |
| Product / applicant organization | Ornigami, an online SaaS product for local-business reputation workflows | Confirm legal entity/applicant name as Google form asks; do not invent. |
| Product website | `https://ornigami.com` | Confirm live public site and current ownership/branding status. This is distinct from the qualifying client's GBP website. |
| Product purpose | Draft response below | Ensure it matches the current live app and privacy disclosures. |
| Contact name, support email, developer email, phone, applicant organization/legal details | `[FILL FROM AUTHORIZED CURRENT BUSINESS RECORDS]` | Unknown in this packet. Do not infer a personal address or use a private client's contact. Ensure contact can receive Google's follow-up. |
| Existing API usage / expected volume / quota rationale | `[FILL ONLY IF THE FORM ASKS; no current real API usage is recorded]` | Basic access request is not a quota increase; never claim traffic, customers, or prior calls not evidenced. |
| Privacy policy / terms / demo links, if requested | `https://ornigami.com/privacy` and `https://ornigami.com/terms` | Recheck both public pages and submit only fields requested. Add a product walkthrough only if actually available and current. |

### Proposed purpose statement

> Ornigami is a web application for local businesses to manage review-reply workflows. A business user connects their own Google Account through OAuth and explicitly grants the `https://www.googleapis.com/auth/business.manage` scope. Ornigami uses the Business Profile APIs to discover the accounts and locations available to that user, synchronize reviews for the business location they select, and show those reviews in the business workspace. The application can generate a suggested reply draft, which the user can review and save. A user may explicitly post an approved reply from the application to the selected profile. Scheduled processing synchronizes reviews and prepares drafts; it does not post replies automatically. Review Booster can use a review URL from a connected location, and can also use a URL the business enters manually.
>
> Each customer must have authorization to manage their own profile and must grant Ornigami OAuth access before Ornigami accesses that profile. The application uses user-authorized data only to provide these review-management features in that customer's workspace. Ornigami does not create Business Profiles, claim ownership of customer profiles, or access profiles the authorizing account cannot manage.

This is a factual draft based on current project scope and A08/A09 contracts. Confirm product/privacy wording against the live release at submission time. It makes no claim about current customer count, requests per minute, existing API calls, client profiles, or a separate agency organization. Do not add auto-posting promises: scheduled work is draft-only under the current A09 behavior.

## Distinguish the Google gates

1. **Eligible applicant/profile**: an applicant account currently manages a qualifying real verified-and-active 60+ day profile. A client may provide Manager access with permission.
2. **Project Basic API Access**: Google approves project `local-lift-477812` through the Basic API Access form. This governs programmatic API availability at the project level.
3. **API enablement and quota**: enable required APIs in the same project and confirm each service's usable quota. Current Account Management and Business Information quotas are both 0 QPM; Google says not to submit a quota-increase request at zero. A future capacity increase, if needed after access, is a separate request.
4. **OAuth brand and data-access status**: the External/Production app's brand/domain verification and any scope-based data-access review are separate. Current Console says `business.manage` is non-sensitive and no data-access verification is required for the current scope set, while brand verification is still held on domain ownership.
5. **Client authorization**: a client separately grants its user Manager access to the client profile, and that user completes Ornigami's OAuth consent. Project approval does not grant access to any customer profile.
6. **Real provider acceptance**: with explicit client authorization for a controlled target, verify connection, discovery, review sync, draft/save, one explicitly approved reply, draft-only cron behavior, and Booster URL derivation. This has not been run.

## OAuth branding follow-up evidence

The 2026-10-03 read-only Console check recorded: app name Ornigami; home/privacy/terms at expected URLs; authorized domain `ornigami.com`; External/Production; both production callbacks plus localhost:3000 counterparts; `business.manage` non-sensitive; no sensitive/restricted scopes; Verification Center says data-access verification not required for current scopes; branding not verified because Google's issue says the homepage is not registered to the applicant's name. Console's prescribed next action is to verify ownership, wait 24 hours, then retry branding verification. The checked Search Console account's property selector has no `ornigami.com` entry. No Console change or OAuth verification submission is recorded here.

For `ornigami.com`, Google requires a Google Account with **Owner permissions for the domain** to be associated with the Cloud project; associate that same account with the project as Owner or Editor. Search Console distinguishes verified Owners from delegated Owners; both have Owner permissions. A Full or Restricted user can view data but does not meet this owner requirement. If DNS control is available, Search Console Domain property verification through DNS covers subdomains. If not, an existing Search Console Owner can add the applicant specifically as a delegated Owner, or an eligible URL-prefix property can be verified using an available method. A URL-prefix property is narrower and supports more methods; a Domain property requires DNS. Verify the top private domain required by OAuth branding. This document does not apply DNS, site, or Console changes. Sources: [OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Verify site ownership](https://support.google.com/webmasters/answer/9008080), [Add a Search Console property](https://support.google.com/webmasters/answer/34592), and [Search Console owners, users, and permissions](https://support.google.com/webmasters/answer/7687615).

Required production callback strings observed on the client:

```text
https://ornigami.com/api/auth/callback/google
https://ornigami.com/api/google/oauth/callback
```

The localhost entries are development callbacks. Google requires the `redirect_uri` used at runtime to exactly match a registered URI. Production web redirects require HTTPS and an owned/authorized domain. Verify the deployed `NEXT_PUBLIC_APP_URL` and actual OAuth client before release. Sources: [OAuth web-server flow and redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies), [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), and [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

## Evidence checklist and handoff

- [x] Read official current prerequisites: profile must be verified/active 60+ days; may be applicant's or client's; business website listed.
- [x] Read official current quota guidance: zero quota means not granted access; apply for Basic API Access, not quota increase.
- [x] Read official current OAuth brand, domain, scope verification, publication, and redirect rules.
- [x] Record 2026-10-03 read-only API/OAuth observations from release owner, without private contact or profile data.
- [ ] Confirm an eligible applicant and real qualifying profile; obtain client consent and accepted Manager invite if client-owned.
- [ ] Establish a Search Console property and ownership for `ornigami.com` through the authorized owner path; wait 24 hours and retry branding verification as instructed; record status/date.
- [ ] Recheck project name/ID/number, applicant contacts, listed profile website, live form fields, product links, and scope list immediately before filing.
- [ ] Submit Basic API Access only after prerequisites are met; save private confirmation and record sanitized date/status/project reference here.
- [ ] After approval, enable the Google My Business API and confirm per-service quota is nonzero; record service IDs and values.
- [ ] Complete client-authorized OAuth and the controlled real-provider acceptance listed in the runbook/A17 matrix.

Root owns current Console access, the Search Console result, and any eventual operator/client handoff. This branch only prepares the documentation. No application or live Google API work is authorized by this packet.

## Official sources

- [GBP API prerequisites](https://developers.google.com/my-business/content/prereqs)
- [GBP API usage limits](https://developers.google.com/my-business/content/limits)
- [GBP API basic setup](https://developers.google.com/my-business/content/basic-setup)
- [Google Business Profile API contact form](https://support.google.com/business/contact/api_default)
- [Business Profile owners and managers](https://support.google.com/business/answer/3403100)
- [Business Profile scope reference](https://developers.google.com/identity/protocols/oauth2/scopes)
- [OAuth branding verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [OAuth sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [OAuth web-server flow and URI validation](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Search Console owners, users, and permissions](https://support.google.com/webmasters/answer/7687615)
- Repository [project scope](../PROJECT_SCOPE.md), [runbook](../GOOGLE_BUSINESS_PROFILE_RUNBOOK.md), [A08 Google handoff](./A08-google-integration.md), [A09 reply policy](./A09-review-draft-policy.md), and [A17 acceptance matrix](./A17_ACCEPTANCE_MATRIX.md).
