import { ReviewRepliesAgentNav } from "@/components/dashboard/review-replies-agent-nav";
import ReviewsPage from "@/app/(dashboard)/reviews/page";

export default function ReviewRepliesReviewsRoute() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <ReviewRepliesAgentNav />
      <ReviewsPage />
    </div>
  );
}

