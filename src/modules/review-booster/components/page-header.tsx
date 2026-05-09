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
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-sm sm:p-8">
      {backToOverview ? (
        <Link
          href="/dashboard/agents/review-booster"
          className="mb-3 inline-flex text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          Back to overview
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
