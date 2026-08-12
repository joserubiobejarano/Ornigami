import Link from "next/link";
import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  backToOverview,
  children
}: {
  title: string;
  description?: string;
  backToOverview?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      {backToOverview ? (
        <Link
          href="/dashboard/agents/review-booster"
          className="mb-3 inline-flex text-sm font-medium text-primary hover:text-primary/80"
        >
          Back to overview
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-card-foreground">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
