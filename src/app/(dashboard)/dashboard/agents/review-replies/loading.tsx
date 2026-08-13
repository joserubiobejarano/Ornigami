import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewRepliesLoading() {
  return <div className="space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-5 w-96" /><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /></div>;
}
