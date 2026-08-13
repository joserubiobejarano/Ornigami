import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return <main className="flex min-h-0 flex-1 flex-col p-6 lg:p-8"><div className="mx-auto w-full max-w-6xl space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-5 w-80" /><div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div><Skeleton className="h-56 w-full" /></div></main>;
}
