export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Privacy and data retention</h1>
      <p>Follow-up visits, message records, and integration payloads are retained for up to 365 days and then purged by the scheduled privacy job.</p>
      <p>To request export or deletion of business data, contact the service owner. The standalone Follow-Up dashboard is protected by the internal admin gate.</p>
    </main>
  );
}
