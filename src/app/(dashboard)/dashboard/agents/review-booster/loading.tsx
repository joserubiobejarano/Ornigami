import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewBoosterLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8" role="status" aria-label="Loading Review Booster dashboard">
      <Skeleton className="h-10 w-full max-w-md" />
      <section className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-7 w-48" />
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
      </section>
    </div>
  );
}
