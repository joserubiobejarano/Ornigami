import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewBoosterLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8" role="status" aria-label="Loading Review Booster dashboard">
      <Skeleton className="h-20 w-full rounded-2xl sm:h-14" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <section className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm sm:p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14" />)}</div>
        <Skeleton className="mt-4 h-14 w-full" />
      </section>
      <section className="space-y-3 rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-ink-sm">
        <Skeleton className="h-7 w-48" />
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
      </section>
    </div>
  );
}
