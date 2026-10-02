export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Privacy and data retention</h1>
      <div className="mt-6 grid gap-4 text-sm leading-6 text-slate-700">
        <p>We process lead contact details, onboarding information, and messaging transcripts to provide the speed-to-lead service.</p>
        <p>Operational leads, conversations, messages, forms, events, and onboarding records are retained for 365 days unless a shorter customer-specific period applies. Expired sessions and rate-limit records are purged after 2 days, and the scheduled privacy job removes expired data automatically.</p>
        <p>Customers can export or delete their business data with the privacy API, or contact the service owner. Deletion removes the business, dashboard access, leads, conversations, messages, and related personal data.</p>
        <p>Sub-processors may include Twilio, Resend, Neon, and Sentry. Contact the service owner for data-subject requests and processor details.</p>
      </div>
    </main>
  );
}
