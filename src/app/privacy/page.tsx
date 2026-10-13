import { PageHero } from "@/components/marketing/primitives";
import { createPageMetadata } from "@/lib/seo";
import { LEGAL_PROCESSOR_LIST } from "@/lib/legal-processors";

export const metadata = createPageMetadata({ title: "Privacy policy | Ornigami", description: "Read how Ornigami collects, uses, and protects information when you use the service.", path: "/privacy" });

export default function PrivacyPage() {
  return (
    <main><PageHero eyebrow="Privacy" title="Privacy at Ornigami" intro="What we collect, why, and the control you have over it." /><article className="prose mx-auto max-w-[70ch] px-4 text-foreground md:px-6">
        <p className="text-muted-foreground">Last updated: 13 October 2026</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as your name, email address,
            business details, review links, billing information, support messages, and the content
            you submit to the product. We also receive technical information needed to secure and
            operate the service, such as device, browser, request, and diagnostic data.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Retention and Your Rights</h2>
          <p>
            Our retention policy limits review-request contact and generated-mail content to 90 days
            after a terminal outcome, and click and integration detail to 90 days. Minimum permission,
            delivery and replay evidence has a 365-day window after its relevant final use or outcome.
            Unresolved operations remain protected until their outcome is established. Suppression
            records remain restricted to preventing unwanted mail, and minimum trial history prevents
            repeat trials; neither is automatically expired. The new cleanup rules require verified
            activation before we claim these periods are automatically enforced.
          </p>
          <p>
            Leads and public demo events have a 90-day window; feedback 365 days, cron history 30 days,
            and rate-limit state 2 days. Expired authentication records are cleaned up separately.
            You may export your account data through the authenticated privacy API. For access,
            correction, restriction, objection or deletion, contact privacy@ornigami.com. Requests are
            handled with assistance while self-service deletion is unavailable; a valid erasure request
            does not have to wait for an ordinary retention period. Any continuing hold is assessed
            and documented individually. Provider and backup copies may require separate handling.
          </p>
          <p>
            We use {LEGAL_PROCESSOR_LIST} for the service workflows described here. Google for
            Business Profile access and OAuth, OpenAI for AI-generated reply drafting and
            profile/content assistance, Resend for email delivery, Stripe for payments, Sentry for
            error monitoring, and Neon for database hosting. Google OAuth tokens are encrypted before storage. Those
            providers may process information in other countries. The applicable processor terms,
            transfer arrangements and backup retention must be verified before customer onboarding.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Customer Review Requests</h2>
          <p>
            The business chooses the recipients and is responsible for its customer notice and evidence
            of permission to send review requests by email. Ornigami requires the permission source,
            time and notice version for that address. A booking or possession of an email address
            alone does not establish permission. We collect only email, optional first name, visit
            time and permission evidence for new visits. Do not submit phone numbers, health details
            or treatment notes. You can unsubscribe through the link in a review-request email.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services,
            process transactions, authenticate access, prevent abuse, send requested notifications,
            provide support, and communicate important service or account changes. We do not sell
            personal information.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Your Choices and Complaints</h2>
          <p>
            You can update your account and business details in Settings, unsubscribe from optional
            follow-up messages, and request a copy or deletion of your data. You may also complain
            to the data protection authority where you live or work if you believe your rights have
            not been respected.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Cookies and legal bases</h2>
          <p>
            Ornigami uses essential cookies and browser storage for authentication, security,
            rate-limiting, and saved preferences. We do not use those technologies to sell personal
            information. Where GDPR applies, we process account data to provide the service, meet
            legal obligations, protect the service, and with your consent where consent is required.
          </p>
          <p>
            You may request access, correction, portability, restriction, or deletion of your data,
            and may object to processing where applicable. Contact privacy@ornigami.com to exercise
            these rights.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
          <p>
            We implement appropriate security measures to protect your personal information.
            However, no method of transmission over the Internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Contact</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at{" "}
            <a href="mailto:privacy@ornigami.com" className="text-primary hover:underline">
              privacy@ornigami.com
            </a>
          </p>
        </section>
      </article></main>
  );
}

