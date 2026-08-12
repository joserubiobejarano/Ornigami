import Link from "next/link";

type AgentActivationPlaceholderProps = {
  agentId: string;
  agentName: string;
  description: string;
};

export function AgentActivationPlaceholder({
  agentId,
  agentName,
  description,
}: AgentActivationPlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-card-foreground">{agentName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 text-sm text-card-foreground">This agent is not active for your business.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action="/api/stripe/checkout" method="post">
            <input type="hidden" name="agent_id" value={agentId} />
            <button
              type="submit"
              className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Activate agent
            </button>
          </form>
          <Link
            href="/dashboard/billing"
            className="inline-flex rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground transition hover:bg-secondary"
          >
            Go to billing
          </Link>
        </div>
      </div>
    </div>
  );
}
