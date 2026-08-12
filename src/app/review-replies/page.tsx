"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CTASection, Eyebrow, FAQItem, FeatureCard, SectionHeading } from "@/components/marketing/primitives";
import { reveal, revealTransition } from "@/lib/motion";

function RepliesMockup() {
  const names = ["Maria G.", "Tom S.", "Ana R."];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-accent-purple" /><span className="text-xs font-medium text-primary">Review inbox</span></div><span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-accent-green">12 new</span></div>
      <div className="divide-y divide-border">
        {names.map((name) => <div key={name} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] text-accent-yellow">★★★★★ <span className="ml-1 text-primary">{name}</span></p><p className="mt-1 text-xs text-muted-foreground">A new review is ready for your voice.</p></div><span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">Approve</span></div><div className="mt-3 rounded-xl border border-border bg-surface p-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-accent-purple"><Sparkles className="h-3 w-3" />Draft ready</div><div className="mt-2 h-2 w-full rounded-full bg-border" /><div className="mt-1.5 h-2 w-3/4 rounded-full bg-border" /></div></div>)}
      </div>
    </div>
  );
}

const faqs = [
  ["Can I edit every draft?", "Yes. Every response is a draft until you approve it, so you can edit the wording before anything is posted."],
  ["Can I connect more than one location?", "The launch version supports one location per subscription. Multi-location support is planned."],
  ["What happens with negative reviews?", "You can keep approval-first controls for every rating and use the draft as a starting point for a thoughtful response."],
] as const;

export default function ReviewRepliesPage() {
  return (
    <main>
      <section className="py-16 md:py-24"><div className="mx-auto grid max-w-7xl items-center gap-14 px-4 md:grid-cols-2 md:px-6 lg:px-8"><motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.07 } } }}><motion.div variants={reveal} transition={revealTransition}><Eyebrow>Review Replies · Google reviews</Eyebrow></motion.div><motion.h1 variants={reveal} transition={revealTransition} className="mt-5 text-5xl font-bold leading-[1.05] text-primary sm:text-6xl">Reply to every review with a voice you trust.</motion.h1><motion.p variants={reveal} transition={revealTransition} className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Ornigami syncs your reviews and prepares personalized, approval-ready replies so your reputation never waits in an inbox.</motion.p><motion.div variants={reveal} transition={revealTransition} className="mt-8 flex flex-wrap gap-3"><Button size="lg" asChild><Link href="/signup">Start free trial <ArrowRight className="h-4 w-4" /></Link></Button><Button size="lg" variant="secondary" asChild><Link href="/demo-review-replies">See a live demo</Link></Button></motion.div><motion.div variants={reveal} transition={revealTransition} className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">{["14-day free trial", "No card required", "Approve-first by default"].map((item) => <span key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-accent-green" />{item}</span>)}</motion.div></motion.div><motion.div initial="hidden" animate="visible" variants={reveal} transition={{ ...revealTransition, delay: 0.2 }}><RepliesMockup /></motion.div></div></section>
      <section className="border-y border-border bg-surface py-20 md:py-24"><div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8"><SectionHeading eyebrow="A simpler reply workflow" title="Less inbox work. More thoughtful responses." intro="Everything you need to turn a review into a clear next action, without losing your judgment." align="center" /><div className="mt-12 grid gap-5 md:grid-cols-3"><FeatureCard icon={MessageSquare} label="One view" title="A clean review inbox" body="See new, drafted, and posted reviews together so nothing quietly slips through." bullets={["Google review sync", "Filter by status", "One focused view"]} /><FeatureCard icon={Sparkles} label="Your voice" title="Drafts with context" body="Give Ornigami your business details and preferred tone, then refine each draft in seconds." bullets={["Business-aware copy", "Language matching", "Edit before posting"]} /><FeatureCard icon={ShieldCheck} label="Control" title="Approval-first by design" body="You decide what goes live. Automation stays optional and visible." bullets={["Approve every draft", "Clear status history", "Safe defaults"]} /></div></div></section>
      <section className="bg-navy-900 py-20 md:py-24"><div className="mx-auto max-w-3xl px-4 md:px-6"><SectionHeading light eyebrow="Review Replies" title="A reliable answer is part of the experience." intro="Start with a focused workflow that gives every customer a thoughtful response." align="center" /><div className="mt-10 space-y-3">{faqs.map(([question, answer]) => <FAQItem dark key={question} question={question} answer={answer} />)}</div></div></section>
      <CTASection title="Give every review a thoughtful next step." body="Start a 14-day free trial with no card required and see the workflow on your own business." />
    </main>
  );
}
