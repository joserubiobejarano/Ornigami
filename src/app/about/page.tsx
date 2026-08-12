export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">About Ornigami</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">Less busywork. More follow-through.</h1>
      <div className="mt-6 space-y-5 text-base leading-8 text-slate-600">
        <p>Ornigami helps local businesses keep review replies and customer follow-ups moving without adding another complicated system to the day.</p>
        <p>We build focused workflows that keep people in control: clear drafts, useful context, and simple approvals when a decision matters.</p>
        <p>Questions or partnership ideas? <a className="font-medium text-violet-700 underline" href="mailto:support@ornigami.com">Contact us</a>.</p>
      </div>
    </main>
  );
}
