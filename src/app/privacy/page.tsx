import { PageHero } from "@/components/marketing/primitives";

export default function PrivacyPage() {
  return (
    <main><PageHero eyebrow="Legal" title="Privacy policy" intro="How Ornigami collects, uses, retains, and protects information." /><article className="prose prose-slate mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
        <p className="text-muted-foreground">Last updated: 12 August 2026</p>
        
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
            Account and business data is retained while your account is active. Leads and public demo
            events are retained for 90 days; feedback, review-link clicks, and integration events for
            365 days; cron history for 30 days; and rate-limit state for 2 days. Demo challenges and
            verification records are removed after expiry. You may export or
            permanently delete your account data through the privacy API or by contacting privacy@ornigami.com.
          </p>
          <p>
            We use Google for Business Profile access and OAuth, OpenAI for AI-generated reply
            drafting and profile/content assistance using review text, business name, and business
            context, Resend for email delivery, Stripe for payments, Sentry for error monitoring,
            and Neon for database hosting. Google OAuth tokens are encrypted before storage. Those
            providers may process information in other countries; we use the safeguards required
            for the applicable transfer and service arrangement.
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

