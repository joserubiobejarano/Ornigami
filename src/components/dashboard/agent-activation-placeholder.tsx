import Link from "next/link";

import { Button } from "@/components/ui/button";

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
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-tint-butter p-7 shadow-ink-md">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Agent</p>
        <h1 className="mt-3 text-3xl font-extrabold text-primary">{agentName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 text-sm text-card-foreground">This is part of the {agentName} plan. Upgrade to turn it on.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action="/api/stripe/checkout" method="post">
            <input type="hidden" name="agent_id" value={agentId} />
            <Button type="submit">
              Activate agent
            </Button>
          </form>
          <Button variant="secondary" asChild>
            <Link href="/dashboard/billing">Go to billing</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
