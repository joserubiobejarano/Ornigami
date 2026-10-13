# Provider evidence and agreement preparation

Reviewed 13 October 2026 against task source `3022643`. **Prepared, not accepted or activated.** Account observations, public provider policies and actual erasure receipts are different evidence. The owner states that existing vendor organizations are not contracted by Ornigami LLC. No provider agreement was accepted, account business identity changed, paid plan selected, message sent or production setting changed.

## Findings that narrow the open inventory

| Service | Evidence obtained | Boundary / remaining action |
| --- | --- | --- |
| Neon | Authenticated production Backup & Restore view shows six-hour history, earliest available restore time **13 October 2026, 00:53 Europe/Madrid** at observation, and **no snapshots / no schedule set** | Earliest time is a moving UI observation, not a successful restore or all-copy expiry. No Preview, Restore or Create action was invoked. External dumps and provider residual backups remain unverified |
| Resend | Inspected account is Free. [Published security policy](https://resend.com/security) states 30-day email/log retention, seven-day PITR backups, deletion of remaining customer data within 90 days after termination and US storage; sending-region choice does not set storage region | These are provider commitments, not measured expiry for this account. Confirm suppression/contact classes, legal exceptions and the accepted customer/terms. Do not describe the EU sending domain as EU-only storage |
| Vercel | Inspected team is Hobby. [Published limits](https://vercel.com/docs/limits) describe one-hour runtime logs, indefinite build logs per deployment and a one-month build-cache lifetime | A runtime window does not close build/deployment retention. Retire or restrict old artifacts through a separately reviewed execution; no deletion performed |
| Sentry | Authenticated account is Developer/EU. [Official pricing](https://sentry.io/pricing/) labels Developer data retention as a 30-day lookback | Lookback is a published offering, not proof of physical backup/deletion expiry. Attachment, source-map, sampled/trace, export and residual-copy details remain open; account privacy controls were captured separately |
| Stripe | CLI 1.45.1 initially reached Kruno; owner-approved authorization then established a separate `ornigami` profile. A read-only test-mode `/v1/account` result shows dashboard name Ornigami, country ES, business type individual and no company name | This is not evidence of an Ornigami LLC seller or deployed/live key. Do not change jurisdiction or business identity through an API update. Preserve Kruno's default login. The applicable Stripe entity and live contract require review of the actual business account |
| Gmail / Google | [Google's general retention policy](https://policies.google.com/technologies/retention?hl=en) describes deletion generally taking about two months, with encrypted backup copies potentially retained up to six months and specific longer-retention exceptions | This is a general policy, not account-specific deletion evidence or a GBP/API-specific retention SLA. Owner chose an existing Gmail inbox; Workspace/Vault/DPA coverage has not been established |

Private evidence includes `neon/restore-metadata.*`, `sentry/published-retention.txt`, public policy captures and `stripe/cli-ornigami-account.json`. The CLI response was restricted to account identity fields; credentials, bank details and personal addresses were excluded. Authorization pairing URLs/codes are ephemeral and are excluded from the evidence manifest and Git.

## Company-side agreement actions

Use **Ornigami LLC**, New Mexico, United States, and manager **Jose Miguel Rubio Bejarano**. The filed agent/mailing address is 1209 Mountain Road Pl NE, Ste N, Albuquerque, NM 87110. Keep actual operating-address and authority originals private. Do not backdate acceptance or substitute a display-name change for a legal customer arrangement.

| Agreement | Reviewed source / preparation | Required completion |
| --- | --- | --- |
| Customer processing | [Reviewable addendum draft](./PRIVACY_CUSTOMER_PROCESSING_ADDENDUM_DRAFT.md) and existing onboarding schedule | Complete the first customer's identity/order, actual security/provider annexes, authorization selection and transfer review, then obtain both parties' acceptance. No customer is invented |
| Neon | [Current Neon product schedule](https://neon.com/platform-terms), updated 5 August 2026, points to the Databricks MCSA. The [MCSA](https://www.databricks.com/legal/mcsa) incorporates the [Databricks DPA](https://www.databricks.com/legal/databricks-data-processing-addendum) | Establish which terms/customer apply to the existing project, document company contracting and retain acceptance. Do not countersign the older Neon PDF merely because it remains downloadable; the current framework requires review |
| Resend | Provider-signed DPA dated 31 December 2025 retained privately; Documents page and published policy say it is incorporated on signup | Establish actual existing customer/terms acceptance and company coverage through the provider's applicable process; preserve the signed reference and actual acceptance record |
| Sentry | In-app DPA 5.1.0, 29 May 2024, reviewed; its acceptance screen would bind J Projects | Establish company coverage and scope for that shared organization before acceptance, or prepare a dedicated company arrangement. Do not affect unrelated projects or sign the shared organization blindly |
| Vercel | [Current DPA](https://vercel.com/legal/dpa), effective 31 March 2026, explicitly covers Pro/Enterprise processing | Existing Hobby observations do not establish coverage under this DPA. Integration must resolve suitable hosting/contract coverage and remaining old copies; no paid upgrade is authorized by this review |
| Stripe | [DPA](https://stripe.com/legal/dpa), updated 28 September 2026, is incorporated into the applicable User agreement and distinguishes controller/processor roles | Review the actual seller/entity and applicable agreement on the correct account. The test individual/ES record does not establish the New Mexico LLC's contract. Preserve legally retained financial records and assess retention by class; do not invent a universal erasure period |
| OpenAI | Personal/Default project data controls and Global residency captured; [official feature-retention guidance](https://developers.openai.com/api/docs/guides/your-data?popup=false) reviewed | Match the deployed credential to its actual project and establish the company's applicable service/DPA arrangement. Disabled training sharing does not establish zero retention |
| Google / inbox | Existing personal Gmail chosen as destination; Google sign-in and GBP services are separate data boundaries | Establish applicable account/product terms, roles and company coverage where required. Do not apply a Workspace or Cloud DPA to consumer Gmail without evidence |
| Forwarding / VPS | Forwarding candidate below; VPS provider not identified in this task | Complete selected provider/customer, processing locations, transfers, retention and accepted terms before activation |

## Forwarding candidate, not selected

ImprovMX's [Namecheap guide](https://improvmx.com/guides/namecheap/) uses **Custom MX** and root records, allowing a prepared additive configuration that leaves independent sending-subdomain records intact. Its [Free offering](https://www.improvmx.com/pricing/) includes one domain, 25 aliases, 500 forwards/day and seven-day email logs. These capacity limits cover the proposed three aliases; delivery and account configuration remain untested.

The [published GDPR page](https://www.improvmx.com/transparency/gdpr-compliance/) describes a DPA download for paid users, one-week backups, two-year retention for expired/canceled users, transient inbound storage in France and outbound infrastructure in France and the US. The linked DPA was retained privately. **Free-plan DPA coverage and the exact separation of message, queue, log, backup and account-data expiry require clarification.** Do not create an account, accept terms, purchase a plan or activate this candidate yet.

See the [routing handoff](./PRIVACY_ROUTING_HANDOFF.md) for the prepared record additions and preserved-record checks. The personal destination remains only in the private mapping.

## Prepared support questions — unsent

These messages request information; they make no purchase, commitment or acceptance. Two matching drafts have been saved in the authenticated owner Gmail inbox and remain **unsent**. Sending them requires the owner's explicit authorization. No credentials, signatures, requester data, private project IDs or destination mapping are included in the bodies. Exact sender/body records and draft screenshots are private under `routing/`.

**Namecheap: `pesupport@namecheap.com`**, the [published Free Email Forwarding support address](https://www.namecheap.com/support/knowledgebase/article.aspx/227/5/how-can-i-request-support-via-email/)

Subject: Ornigami privacy evidence: root forwarding with sending-subdomain MX

> We are preparing inbound aliases for ornigami.com on Namecheap BasicDNS. Mail Settings currently uses Custom MX with a send.reviews MX record pointing to an Amazon SES feedback host. We need info, privacy and support aliases forwarded to an existing inbox while preserving all sending-subdomain MX, SPF and DKIM records. Does your built-in Email Forwarding mode support this coexistence, and what exact procedure preserves those records? Please also identify the applicable processing agreement and retention of forwarded message content, queues, delivery logs and backups. We are requesting information only; please do not change the domain settings.

**ImprovMX: `support@improvmx.com`**, verified on its [official contact page](https://improvmx.com/contact/)

Subject: Ornigami privacy evidence: Free forwarding DPA and retention

> Ornigami LLC is evaluating your Free plan for three inbound aliases on ornigami.com, forwarded to an existing inbox. Your Namecheap guide uses Custom MX, while your GDPR page describes DPA download/countersignature for paid users. Please confirm whether the published DPA can be incorporated and executed with Ornigami LLC on Free, or identify the minimum plan and contracting process. Please separate retention/deletion for message content, pending queues, delivery logs, routine backups and account data, including the published two-year canceled-user period. We also need current processing/subprocessor locations and transfer safeguards. No account, purchase or activation is requested by this inquiry.
