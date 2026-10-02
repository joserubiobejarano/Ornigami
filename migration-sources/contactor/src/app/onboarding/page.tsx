import { OnboardingForm } from "@/app/onboarding/onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Assistant Setup Intake
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
          Tell us how to configure your lead assistant
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          This takes just a few minutes. We will review your details and set up your assistant
          manually.
        </p>
      </header>

      <section className="mt-6">
        <OnboardingForm />
      </section>
    </main>
  );
}
