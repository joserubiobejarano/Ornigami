"use client";

import { ReviewRepliesAgentNav } from "@/components/dashboard/review-replies-agent-nav";
import ConnectPage from "@/modules/review-replies/pages/connect-page";

export default function ReviewRepliesGoogleConnectionRoute() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <ReviewRepliesAgentNav />
      <ConnectPage />
    </div>
  );
}
