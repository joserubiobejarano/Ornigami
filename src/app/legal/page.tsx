export default function LegalPage() {
  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Legal Information</h1>
      <div className="prose max-w-none space-y-6">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Company Information</h2>
          <p>
            Ornigami is operated by Ornigami. For legal inquiries, please contact
            us at{" "}
            <a href="mailto:legal@ornigami.app" className="text-primary hover:underline">
              legal@ornigami.app
            </a>
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
      </div>
    </div>
  );
}
