export default function LegalPage() {
  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Legal Information</h1>
      <div className="prose max-w-none space-y-6">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Company Information</h2>
          <p>
            LocalLift is operated by LocalLift, Inc. For legal inquiries, please contact
            us at{" "}
            <a href="mailto:legal@locallift.com" className="text-primary hover:underline">
              legal@locallift.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Intellectual Property</h2>
          <p>
            All content, features, and functionality of LocalLift are owned by LocalLift, Inc.
            and are protected by international copyright, trademark, and other intellectual
            property laws.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Disclaimer</h2>
          <p>
            The information on this website is provided on an &quot;as is&quot; basis. To the fullest
            extent permitted by law, LocalLift excludes all representations, warranties,
            and conditions relating to our website and the use of this website.
          </p>
        </section>
      </div>
    </div>
  );
}
