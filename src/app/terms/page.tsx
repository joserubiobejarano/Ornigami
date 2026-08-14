import { PageHero } from "@/components/marketing/primitives";
import { createPageMetadata } from "@/lib/seo";
import { LEGAL_PROCESSOR_LIST } from "@/lib/legal-processors";

export const metadata = createPageMetadata({ title: "Terms of service | Ornigami", description: "Read the terms that apply when you use Ornigami's review and local growth workflows.", path: "/terms" });

export default function TermsPage() {
  return (
    <main><PageHero eyebrow="Terms" title="Terms of service" intro="The agreement between you and Ornigami, in plain terms." /><article className="prose mx-auto max-w-[70ch] px-4 text-foreground md:px-6">
        <p className="text-muted-foreground">Last updated: 12 August 2026</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
          <p>
            By accessing and using Ornigami, you accept and agree to be bound by the terms
            and provision of this agreement.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Use License</h2>
          <p>
            Permission is granted to temporarily use Ornigami for personal or commercial
            business purposes. This is the grant of a license, not a transfer of title.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Your Account and Content</h2>
          <p>
            You are responsible for keeping your account credentials secure and for ensuring that
            the information and content you submit may be used for the requested workflow. Do not
            use the service to send unlawful, deceptive, abusive, or unsolicited messages, or to
            interfere with the service or another person&apos;s account.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Subscription and Billing</h2>
          <p>
            Plans may be billed monthly or annually, according to the billing period selected at
            checkout. You may cancel your subscription at any time from the billing portal. If a
            refund is available, contact support@ornigami.com and include your account details.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Limitations</h2>
          <p>
            Ornigami shall not be liable for any damages arising from the use or inability
            to use the service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Third-Party Services and Availability</h2>
          <p>
            Ornigami connects with third-party services such as {LEGAL_PROCESSOR_LIST}. Their
            availability and terms may affect parts of the service. We work
            to keep Ornigami available and secure, but do not promise uninterrupted or error-free
            operation.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Changes and Contact</h2>
          <p>
            We may update these terms when the service or legal requirements change. We will update
            the date above and provide notice where required. Questions about these terms can be sent
            to{" "}
            <a href="mailto:legal@ornigami.com" className="text-primary hover:underline">
              legal@ornigami.com
            </a>.
          </p>
        </section>
      </article></main>
  );
}

