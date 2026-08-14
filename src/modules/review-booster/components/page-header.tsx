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
    <section className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-surface p-6 shadow-ink-sm sm:p-8">
      {backToOverview ? (
        <Link
          href="/dashboard/agents/review-booster"
          className="mb-3 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to overview
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
