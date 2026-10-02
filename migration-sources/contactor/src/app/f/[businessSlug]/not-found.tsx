import Link from "next/link";

export default function HostedFormNotFound() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Hosted Form
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Business form not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          Check the form URL slug or create the business record before sharing this link.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Go Home
        </Link>
      </section>
    </main>
  );
}
