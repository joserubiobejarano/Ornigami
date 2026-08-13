import { PublicReviewRepliesDemoPage } from "@/components/demo/public-review-replies-demo-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Review Replies demo | Ornigami", description: "Try the Ornigami review reply workflow with sample data.", path: "/demo-review-replies", noIndex: true });

export default function PublicReviewRepliesDemoInternalRoute() {
  return <PublicReviewRepliesDemoPage />;
}
