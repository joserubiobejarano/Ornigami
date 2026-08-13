import { PublicReviewBoosterDemoPage } from "@/components/demo/public-review-booster-demo-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Review Booster demo | Ornigami", description: "Try the Ornigami review follow-up workflow with sample data.", path: "/demo-review-booster", noIndex: true });

export default function PublicReviewBoosterDemoInternalRoute() {
  return <PublicReviewBoosterDemoPage />;
}
