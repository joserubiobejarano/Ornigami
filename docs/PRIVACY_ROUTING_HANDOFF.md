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

## Provider and execution review

[Namecheap's forwarding guide](https://www.namecheap.com/support/knowledgebase/article.aspx/308/2214/how-to-set-up-free-email-forwarding/) describes forwarding on BasicDNS, automatic MX configuration on saving Email Forwarding mode and a required SPF record. It also says that forwarding cannot be used alongside another email service. The guide does not establish whether the existing sending-subdomain setup can safely coexist. Therefore **do not switch Custom MX to Email Forwarding until that compatibility and preservation are established**. The owner selected the destination, not a provider or a purchase.

Integration/operator steps:

1. Establish a forwarding provider/configuration that preserves the existing sending subdomains. Capture its actual account, legal customer, applicable agreement, rights channel, forwarding/log/queue/backup retention and access ownership. If Namecheap's built-in service cannot preserve the required records, use a separately reviewed root-domain forwarding configuration; do not improvise record replacement or add a paid service without authorization.
2. Prepare an exact before/after DNS diff and three direct alias mappings privately. Include rollback to the captured prior values and ownership of the receiving Gmail account. Do not publish the Gmail destination in DNS or Git merely to configure aliases.
3. Apply through the integration/operator path. Preserve resulting authoritative root and sending-subdomain DNS answers, provider alias settings and execution timestamps. DNS/alias settings alone do not prove delivery.
4. Obtain explicitly authorized replacement checks from an approved sender different from the destination inbox. Use one unique non-personal correlation token per alias. Namecheap's guide warns that testing from the forwarding destination can fail. Capture sender-side send and destination-side original arrival/header evidence, actual timestamps and outcome; inspect spam as appropriate. This task did not send any probe.
5. Verify each route independently. For privacy/support, hash the exact private evidence and use the existing `route-receipt` CLI with the actual observation time and result. Keep the info route's delivery evidence separately; the CLI only supports privacy/support. A failure leaves the route open. Do not treat a Settings screenshot, outbound transactional receipt or fabricated hash as arrival proof.
6. Confirm inbox custody, daily rights-request monitoring, restricted access, secure response handling, and reviewed Gmail/forwarder trash/archive/backup expiry. Keep the assisted rights process and separate provider/retention gates in force.

See [closure evidence](./PRIVACY_EVIDENCE_CLOSURE.md) and the [retention inventory](./PRIVACY_RETENTION_INVENTORY.md). No DNS change, forwarding rule, message, paid mailbox, agreement acceptance or deployment was performed in this task.
