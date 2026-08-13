import ContactPage from "@/app/contact/page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Send feedback to Ornigami", description: "Share feedback with the Ornigami team.", path: "/feedback", noIndex: true });

export default function FeedbackPage() { return <ContactPage />; }
