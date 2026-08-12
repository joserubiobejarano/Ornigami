export default function ContactPage() {
  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Contact Us</h1>
      <div className="prose max-w-none space-y-6">
        <p className="text-muted-foreground">
          Have questions or need support? We&apos;re here to help.
        </p>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Email</h2>
            <p>
              <a href="mailto:support@ornigami.com" className="text-primary hover:underline">
                support@ornigami.com
              </a>
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Response Time</h2>
            <p className="text-muted-foreground">
              We typically respond within 24-48 hours during business days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

