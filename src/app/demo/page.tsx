import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHero, TintCard } from "@/components/marketing/primitives";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Try the Ornigami live demo", description: "Explore Ornigami's review replies and review follow-up workflows with sample data, no account required.", path: "/demo", noIndex: true });

export default function DemoLandingPage() {
  return <main><PageHero eyebrow="Live demo" title="See Ornigami with sample data." intro="Explore both agents with an example business — no account needed." /><section className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20"><p className="mb-6 text-center text-sm text-muted-foreground">This is example data, so you can click around freely.</p><div className="grid gap-5 md:grid-cols-2"><TintCard icon={MessageSquare} tint="navy" accent="navy" label="Review Replies" title="Try replying." body="See how drafts appear and how approving works." href="/demo-review-replies" /><TintCard icon={Send} tint="peach" accent="coral" label="Review Booster" title="Try a follow-up." body="See how visits turn into gentle review requests." href="/demo-review-booster" /></div><div className="mt-8 text-center"><Button variant="secondary" asChild><Link href="/signup">Create a free account</Link></Button></div></section></main>;
}
