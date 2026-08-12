export default function TermsPage() {
  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <div className="prose max-w-none space-y-6">
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
      </div>
    </div>
  );
}

