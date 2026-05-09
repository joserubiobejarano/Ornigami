import { ReviewRepliesAgentNav } from "@/components/dashboard/review-replies-agent-nav";
import SettingsPage from "@/app/(dashboard)/settings/page";

export default function ReviewRepliesSettingsRoute() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <ReviewRepliesAgentNav />
      <SettingsPage />
    </div>
  );
}

