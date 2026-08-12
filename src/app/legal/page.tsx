import { PageHero } from "@/components/marketing/primitives";

export default function LegalPage() {
  return (
    <main><PageHero eyebrow="Legal" title="Legal information" intro="The short version of how Ornigami operates and where to direct formal notices." /><article className="prose prose-slate mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Company Information</h2>
          <p>
            Ornigami is the product name used by the service operator. The legal entity name,
            registered address, and registration details should be confirmed in the applicable
            order or subscription records. For legal inquiries, please contact us at{" "}
            <a href="mailto:legal@ornigami.com" className="text-primary hover:underline">
              legal@ornigami.com
            </a>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Please use this address for requests about contracts, intellectual property, or formal
            notices. The Privacy Policy explains how to exercise data-protection rights.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Intellectual Property</h2>
          <p>
            All content, features, and functionality of Ornigami are owned by Ornigami
            and are protected by international copyright, trademark, and other intellectual
            property laws.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Disclaimer</h2>
          <p>
            The information on this website is provided on an &quot;as is&quot; basis. To the fullest
            extent permitted by law, Ornigami excludes all representations, warranties,
            and conditions relating to our website and the use of this website.
          </p>
        </section>
      </article></main>
  );
}
