export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as when you create an account,
            use our services, or contact us for support.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Retention and Your Rights</h2>
          <p>
            Account and business data is retained while your account is active. Leads and public demo
            events are retained for 90 days; feedback, review-link clicks, and integration events for
            365 days; cron history for 30 days; and rate-limit state for 2 days. Demo challenges and
            verification records are removed after expiry. You may export or
            permanently delete your account data through the privacy API or by contacting privacy@ornigami.app.
          </p>
          <p>
            We use Google, Stripe, Twilio, OpenAI, Resend, Sentry, and Neon as service providers where
            needed to deliver the product. Google OAuth tokens are encrypted before storage.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services,
            process transactions, and communicate with you.
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
            <a href="mailto:privacy@ornigami.app" className="text-primary hover:underline">
              privacy@ornigami.app
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}

