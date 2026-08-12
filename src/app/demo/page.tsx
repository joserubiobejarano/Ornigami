import Link from "next/link";
import { MessageSquare, Star, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/marketing/primitives";

export default function DemoLandingPage() {
  const demos: Array<{ title: string; body: string; icon: LucideIcon; accent: string; href: string; label: string }> = [
    { title: "Review Replies Demo", body: "Try drafted replies with sample Google reviews.", icon: MessageSquare, accent: "text-accent-purple", href: "/demo-review-replies", label: "Try Review Replies" },
    { title: "Review Booster Demo", body: "Send yourself a sample post-visit review request and see the customer experience.", icon: Star, accent: "text-accent-green", href: "/demo-review-booster", label: "Try Review Booster" },
  ];
  return <main><PageHero eyebrow="Sample data" title="Try Ornigami before you create an account." intro="Explore the two workflows with realistic sample data. Nothing here touches your live Google profile." /><section className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20"><div className="grid gap-5 md:grid-cols-2">{demos.map(({ title, body, icon: Icon, accent, href, label }) => <Card key={title} className="border-border bg-card shadow-sm"><CardHeader><div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-surface ${accent}`}><Icon className="h-5 w-5" /></div><CardTitle>{title}</CardTitle><CardDescription>{body}</CardDescription></CardHeader><CardContent><Button asChild><Link href={href}>{label}</Link></Button></CardContent></Card>)}</div><div className="mt-8 text-center"><Button variant="secondary" asChild><Link href="/signup">Create free account</Link></Button></div></section></main>;
}
