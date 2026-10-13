# Privacy routing integration handoff

Prepared 13 October 2026. **Plan only; live routing and delivery proof remain open.** The owner withdrew the earlier Zoho mailbox identification and reports no confirmed place to read `info@ornigami.com`. The owner chose to forward all three published addresses directly to the existing Gmail inbox. Its exact destination is in private `owner-clarifications.json`, outside Git.

| Published address | Owner-selected destination |
| --- | --- |
| `info@ornigami.com` | Existing owner Gmail inbox, private mapping |
| `privacy@ornigami.com` | Same inbox, direct forwarding |
| `support@ornigami.com` | Same inbox, direct forwarding |

Do not chain privacy/support through an unverified info mailbox. Gmail will be the receiving inbox; sending as these aliases is a separate capability and is not included in this plan.

## Current configuration

The privately captured Namecheap configuration uses BasicDNS and Custom MX. The only displayed mail record is `send.reviews` → `feedback-smtp.eu-west-1.amazonses.com.`, priority 10, automatic TTL. It supports the existing outbound feedback path. An authoritative query for the root domain returned no MX answer. No qualifying historical privacy/support delivery receipt was recovered. The inspected Namecheap account has no displayed Ornigami Private Email subscription.

The root-domain inbound correction must preserve existing application A/CNAME records, verified sending subdomain MX/SPF/DKIM records and any other current records. Refresh the private DNS snapshot at execution time; other integration work may have changed records since this observation.

## No-email constraint and received compatibility answer

The owner now prohibits agent-sent emails, including route probes and further support replies. Continue with existing incoming receipts and provider replies only. If no original receipt is available, the owner must perform an independent delivery check after routing is actually configured; no token or successful observation may be fabricated. The latest authoritative query still returns no root MX answer.

Namecheap's substantive reply arrived 13 October 2026 at 15:55 Europe/Madrid and confirms that built-in forwarding cannot coexist with Custom MX mode. It proposes FreeDNS enrollment and subdomain NS delegation as a workaround before enabling bare-domain forwarding. This is a separate DNS migration/delegation plan requiring complete existing sending-record preservation, authoritative checks and rollback review. It was not executed. The reply says messages pass through without being saved on forwarding servers; destination backup and queue/log/account/DPA boundaries remain unresolved. Body and sender/header observations are retained privately; no reply or account/PIN disclosure was made. See the [provider record](./PRIVACY_PROVIDER_REVIEW.md#namecheap-substantive-reply-received-no-outbound-follow-up).

## Provider and execution review

The owner-authorized Namecheap compatibility/retention and ImprovMX Free-plan DPA/retention inquiries were sent on 13 October 2026. Namecheap's substantive compatibility reply is recorded above; its unanswered DPA/retention details and ImprovMX's human clarification remain open. See the [provider dossier](./PRIVACY_PROVIDER_REVIEW.md#provider-support-inquiries-sent-answers-pending) for the sent texts and evidence boundaries. This correspondence does not establish delivery to the three published aliases.

Fresh authoritative DNS inspection at **15:27 UTC on 13 October 2026** returned zero MX answers from `dns1.registrar-servers.com` (SOA serial 1791864068). A scoped Gmail search for incoming/delivered messages to all three aliases found no matching messages. Both observations are retained privately; neither proves absence of every historical message. No DNS activation or probe was performed. The owner requires no agent-sent emails.

ImprovMX subsequently returned an AI-generated answer asserting Free-plan DPA coverage. Human confirmation is still needed to reconcile that with its paid-user DPA instructions and answer the remaining queue/backup/account-data questions. The owner authorized a human-clarification reply, sent at 13:11 Europe/Madrid; the answer remains pending. The owner subsequently completed signup on behalf of the company; authenticated inspection verifies Free — Active and no domains configured. Signup staging does not settle DPA coverage or prove routing. Every service must remain on a free tier. Provider-selection and activation prerequisites remain open.

[Namecheap's forwarding guide](https://www.namecheap.com/support/knowledgebase/article.aspx/308/2214/how-to-set-up-free-email-forwarding/) describes forwarding on BasicDNS, automatic MX configuration on saving Email Forwarding mode and a required SPF record. It also says that forwarding cannot be used alongside another email service. The guide does not establish whether the existing sending-subdomain setup can safely coexist. Therefore **do not switch Custom MX to Email Forwarding until that compatibility and preservation are established**. The owner selected the destination, not a provider or a purchase.

An additive **ImprovMX candidate** has now been prepared from its [official Namecheap guide](https://improvmx.com/guides/namecheap/). It keeps Custom MX mode and adds the root records below while preserving every existing subdomain and application record. This is a reviewable candidate, not an approved provider/account or an executed change:

| Proposed operation | Type / host | Value / priority | Precondition |
| --- | --- | --- | --- |
| Add root inbound primary | MX / `@` | `mx1.improvmx.com`, priority 10, Automatic TTL | Provider account, three aliases and company agreement reviewed before activation |
| Add root inbound secondary | MX / `@` | `mx2.improvmx.com`, priority 20, Automatic TTL | Same prerequisite; no removal of `send.reviews` or other existing records |
| Add or merge root SPF | TXT / `@` | Candidate `v=spf1 include:spf.improvmx.com ~all`, Automatic TTL | Use the selected account's recommended value; merge any existing root SPF rather than create a duplicate or remove another service |
| Configure three aliases | Provider dashboard | info/privacy/support → private owner-approved Gmail mapping | Direct aliases only; destination is not placed in public DNS |

The refreshed authoritative root queries found no MX or TXT answer on 13 October. Repeat immediately before execution because other integration work may change records. Preserve sending-subdomain SPF independently; SPF policies are per hostname. Resolve a fresh exact before/after diff and retain unrelated TXT records.

The [provider review](./PRIVACY_PROVIDER_REVIEW.md#forwarding-candidate-not-selected) records Free-plan capacity, published retention and an unresolved DPA qualification: the GDPR page describes its signed DPA for paid users. Obtain written Free-plan coverage or review a different arrangement before recommending activation. The owner completed the staged Free signup after initial preparation; no purchase, domain configuration or automatic DNS integration was initiated. Prepared provider questions are included in that review.

Integration/operator steps:

1. Establish a forwarding provider/configuration that preserves the existing sending subdomains. Capture its actual account, legal customer, applicable agreement, rights channel, forwarding/log/queue/backup retention and access ownership. If Namecheap's built-in service cannot preserve the required records, use a separately reviewed root-domain forwarding configuration; do not improvise record replacement or add a paid service without authorization.
2. Prepare an exact before/after DNS diff and three direct alias mappings privately. Include rollback to the captured prior values and ownership of the receiving Gmail account. Do not publish the Gmail destination in DNS or Git merely to configure aliases.
3. Apply through the integration/operator path. Preserve resulting authoritative root and sending-subdomain DNS answers, provider alias settings and execution timestamps. DNS/alias settings alone do not prove delivery.
4. Obtain explicitly authorized replacement checks from an approved sender different from the destination inbox. Use one unique non-personal correlation token per alias. Namecheap's guide warns that testing from the forwarding destination can fail. Capture sender-side send and destination-side original arrival/header evidence, actual timestamps and outcome; inspect spam as appropriate. This task did not send any probe.
5. Verify each route independently. For privacy/support, hash the exact private evidence and use the existing `route-receipt` CLI with the actual observation time and result. Keep the info route's delivery evidence separately; the CLI only supports privacy/support. A failure leaves the route open. Do not treat a Settings screenshot, outbound transactional receipt or fabricated hash as arrival proof.
6. Confirm inbox custody, daily rights-request monitoring, restricted access, secure response handling, and reviewed Gmail/forwarder trash/archive/backup expiry. Keep the assisted rights process and separate provider/retention gates in force.

See [closure evidence](./PRIVACY_EVIDENCE_CLOSURE.md), the [provider review](./PRIVACY_PROVIDER_REVIEW.md) and the [retention inventory](./PRIVACY_RETENTION_INVENTORY.md). The owner completed the Free signup terms step; Free-plan DPA acceptance remains unresolved. No DNS change, forwarding rule, route probe, paid mailbox or deployment was performed in this task.
