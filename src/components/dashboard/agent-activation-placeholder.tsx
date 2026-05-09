import Link from "next/link";

type AgentActivationPlaceholderProps = {
  agentName: string;
  description: string;
};

export function AgentActivationPlaceholder({
  agentName,
  description,
}: AgentActivationPlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{agentName}</h1>
        <p className="mt-2 text-sm text-slate-700">{description}</p>
        <p className="mt-4 text-sm text-slate-800">This agent is not active for your business.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/dashboard/billing"
            className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Activate agent
          </Link>
          <Link
            href="/dashboard/billing"
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
          >
            Go to billing
          </Link>
        </div>
      </div>
    </div>
  );
}
