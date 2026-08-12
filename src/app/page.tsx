"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, BarChart3, Check, Clock3, MessageSquare, Search, Send, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CTASection, Eyebrow, FAQItem, FeatureCard, FoldedCorner, SectionHeading } from "@/components/marketing/primitives";
import { reveal, revealTransition } from "@/lib/motion";

const faqs = [
  ["Do I need a website to use Ornigami?", "No. Ornigami works with your Google Business Profile, even if you do not have a website."],
  ["Will the replies sound like my brand?", "Yes. You set your tone and business context, and every draft can be edited before it is posted."],
  ["Is there a free trial?", "Yes. Start a 14-day free trial with no card required. Cancel anytime from billing."],
  ["What does Review Booster do?", "It sends a friendly follow-up after a visit, inviting customers to share feedback and find your Google review link."],
  ["Will Ornigami post without approval?", "No. Approval-first is the default. Automation is optional and can be configured for eligible replies."],
  ["Can I manage multiple locations?", "The launch version supports one location per subscription. Multi-location management is planned."],
] as const;

function ReviewInboxMockup() {
  const reviews = [
    ["Sarah M.", "Amazing food and friendly staff", true],
    ["James K.", "Great place, parking was tricky", false],
    ["Luna R.", "Best coffee in the neighborhood", false],
  ] as const;
  return <div className="relative"><div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-surface" /><div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-2xl border border-border bg-surface" /><div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md"><FoldedCorner /><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-border" /><span className="h-2.5 w-2.5 rounded-full bg-border" /><span className="h-2.5 w-2.5 rounded-full bg-border" /></div><span className="text-xs font-medium text-muted-foreground">Review inbox</span></div><span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-accent-green"><span className="h-1.5 w-1.5 rounded-full bg-accent-green" />Live</span></div><div className="flex items-center justify-between bg-surface px-4 py-2.5 text-xs"><span className="text-muted-foreground">3 reviews today</span><span className="font-semibold text-primary">100% reply rate</span></div><div className="divide-y divide-border">{reviews.map(([author, text, replied]) => <div key={author} className="px-4 py-3"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5"><span className="text-[11px] text-accent-yellow" aria-label="5 out of 5 stars">★★★★★</span><span className="text-[11px] font-medium text-primary">{author}</span></div><p className="mt-0.5 text-[11px] text-muted-foreground">{text}</p></div>{replied ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-accent-green">✓ Sent</span> : <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">Approve</span>}</div>{!replied ? <div className="mt-2 rounded-lg border border-border bg-surface px-2.5 py-2"><p className="mb-1 text-[10px] font-medium text-accent-purple">Draft ready</p><div className="h-1.5 w-full rounded-full bg-border" /><div className="mt-1 h-1.5 w-3/4 rounded-full bg-border" /></div> : null}</div>)}</div><div className="border-t border-border bg-surface px-4 py-3"><div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">This week</span><span className="font-semibold text-primary">0 unanswered</span></div></div></div></div>;
}

function PreviousReviewInboxMockup() {
  const reviews = [
    ["Sarah M.", "Amazing food and the staff was so friendly!", true, 5],
    ["James K.", "Great place, parking was a bit tricky but worth it.", false, 4],
    ["Luna R.", "Best coffee in the neighborhood, will come back!", false, 5],
  ] as const;

  return (
    <div className="relative select-none">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-slate-100" />
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-2xl border border-slate-200 bg-slate-50" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            </div>
            <span className="ml-1 text-xs font-medium text-slate-400">Review Inbox</span>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>

        <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
          <span className="text-xs text-slate-500">3 reviews today</span>
          <span className="text-xs font-semibold text-slate-700">100% reply rate</span>
        </div>

        <div className="divide-y divide-slate-100">
          {reviews.map(([author, text, replied, stars]) => (
            <div key={author} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-amber-400" aria-label={`${stars} out of 5 stars`}>
                      {"★".repeat(stars)}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600">{author}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{text}</p>
                </div>
                {replied ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    ✓ Sent
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                    Approve
                  </span>
                )}
              </div>
              {!replied && (
                <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50 px-2.5 py-2">
                  <p className="mb-1 text-[10px] font-medium text-purple-400">Draft ready</p>
                  <div className="h-1.5 w-full rounded-full bg-purple-200/60" />
                  <div className="mt-1 h-1.5 w-3/4 rounded-full bg-purple-100" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">This week</span>
            <div className="flex gap-4">
              <span className="font-semibold text-slate-800">+28% profile views</span>
              <span className="font-semibold text-slate-800">0 unanswered</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviousHero() {
  return (
    <div className="previous-hero">
      <section className="relative overflow-hidden bg-white pb-24 pt-16">
        <div className="pointer-events-none absolute -left-48 -top-24 h-[500px] w-[500px] rounded-full bg-purple-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-20 h-[400px] w-[400px] rounded-full bg-orange-100/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-sky-100/30 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="grid gap-14 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-600"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Local reputation management, made practical
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl"
              >
                A smarter way to run <span className="text-slate-900">your local growth</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.16 }}
                className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600"
              >
                Ornigami gives you an evolving hub of specialized agents for reviews, reputation, and local visibility, so your team can execute faster without losing brand control.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.24 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200/70 transition-all hover:brightness-105 hover:shadow-orange-200"
                >
                  Try it free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  See a live demo
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500"
              >
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  14-day free trial
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  No card required
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Cancel anytime
                </span>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2 }}
              className="w-full max-w-sm md:max-w-none"
            >
              <PreviousReviewInboxMockup />
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RestoredReviewRepliesMockup() {
  const reviews = [
    { stars: 5, author: "Maria G.", text: "Fantastic service! We had a wonderful evening." },
    { stars: 4, author: "Tom S.", text: "Great food, a little loud on weekends." },
    { stars: 5, author: "Ana R.", text: "My favourite spot in the whole city." },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          </div>
          <span className="ml-1 text-xs text-slate-400">Review Inbox</span>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          ↻ 12 new
        </span>
      </div>

      <div className="divide-y divide-slate-800">
        {reviews.map((review) => (
          <div key={review.author} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-amber-400" aria-label={`${review.stars} out of 5 stars`}>
                    {"★".repeat(review.stars)}
                  </span>
                  <span className="text-[11px] font-medium text-slate-300">{review.author}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{review.text}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-900">
                Approve
              </span>
            </div>
            <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5">
              <p className="mb-1 text-[10px] font-medium text-purple-400">Reply ready →</p>
              <div className="h-1.5 w-full rounded-full bg-purple-500/25" />
              <div className="mt-1 h-1.5 w-2/3 rounded-full bg-purple-500/15" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestoredReviewBoosterMockup() {
  const customers = [
    { name: "Maria G.", date: "Today, 2:30 pm", status: "sent", review: true },
    { name: "Tom S.", date: "Today, 11:00 am", status: "pending", review: false },
    { name: "Ana R.", date: "Yesterday", status: "sent", review: true },
    { name: "Luis P.", date: "Yesterday", status: "pending", review: false },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          </div>
          <span className="ml-1 text-xs text-slate-400">Review Booster</span>
        </div>
        <button className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
          ▶ Run campaign
        </button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800">
        {[
          { label: "Visits", value: "24" },
          { label: "Follow-ups", value: "8" },
          { label: "New reviews", value: "5" },
        ].map((stat) => (
          <div key={stat.label} className="px-3 py-3 text-center">
            <p className="text-base font-bold text-slate-100">{stat.value}</p>
            <p className="text-[10px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="divide-y divide-slate-800">
        {customers.map((customer) => (
          <div key={customer.name} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
                {customer.name.split(" ").map((part) => part[0]).join("")}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">{customer.name}</p>
                <p className="text-[10px] text-slate-500">{customer.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {customer.review && (
                <span className="text-[10px] text-amber-400" aria-label="5 out of 5 stars">★★★★★</span>
              )}
              {customer.status === "sent" ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Sent
                </span>
              ) : (
                <button className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
                  Pending
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentMockup({ kind }: { kind: "replies" | "booster" }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-700 bg-navy-800 shadow-md"><div className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 ${kind === "replies" ? "text-accent-purple" : "text-accent-green"}`}>{kind === "replies" ? <MessageSquare className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}</span><span className="text-xs text-slate-300">{kind === "replies" ? "Review inbox" : "Review Booster"}</span></div><span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-200">{kind === "replies" ? "12 new" : "Live"}</span></div>{kind === "replies" ? <div className="divide-y divide-slate-700">{["Maria G.", "Tom S.", "Ana R."].map((name) => <div key={name} className="px-4 py-3"><div className="flex items-center justify-between"><div><span className="text-[11px] text-accent-yellow">★★★★★</span><span className="ml-2 text-[11px] font-medium text-slate-200">{name}</span><p className="mt-1 text-[11px] text-slate-400">A new review is ready for your voice.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-navy-900">Approve</span></div><div className="mt-2 rounded-lg border border-slate-600 bg-slate-700/60 px-2.5 py-1.5"><p className="text-[10px] font-medium text-accent-purple">Reply ready →</p><div className="mt-1 h-1.5 w-full rounded-full bg-slate-500" /></div></div>)}</div> : <><div className="grid grid-cols-3 divide-x divide-slate-700 border-b border-slate-700">{[["Visits", "24"], ["Follow-ups", "8"], ["New reviews", "5"]].map(([label, value]) => <div key={label} className="px-3 py-3 text-center"><p className="font-mono text-base font-semibold text-slate-100">{value}</p><p className="text-[10px] text-slate-400">{label}</p></div>)}</div><div className="divide-y divide-slate-700">{[["Maria G.", "Sent"], ["Tom S.", "Pending"], ["Ana R.", "Sent"]].map(([name, status]) => <div key={name} className="flex items-center justify-between px-4 py-3"><div className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-300">{name.split(" ").map((part) => part[0]).join("")}</span><div><p className="text-xs font-medium text-slate-200">{name}</p><p className="text-[10px] text-slate-400">Today, 2:30 pm</p></div></div><span className={`rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold ${status === "Sent" ? "text-accent-green" : "text-slate-300"}`}>{status}</span></div>)}</div></>}</div>;
}

export default function HomePage() {
  return <main className="overflow-hidden">
    <PreviousHero />

    <section className="border-y border-border bg-surface py-20 md:py-24"><div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8"><SectionHeading eyebrow="What Ornigami does" title="A focused platform for the moments that shape local growth." intro="Keep the customer-facing work moving without adding another noisy dashboard to your day." align="center" /><div className="mt-12 grid gap-5 md:grid-cols-3"><FeatureCard icon={MessageSquare} label="Review Replies" title="Every review answered" body="Bring your Google review inbox into one place and turn your voice into polished, approval-ready drafts." bullets={["One clean review inbox", "Drafts that sound like you", "Approve before anything goes live"]} href="/review-replies" /><FeatureCard icon={Send} accent="green" label="Review Booster" title="More feedback after each visit" body="Follow up at the right moment with a friendly message that makes it easy for happy customers to share feedback." bullets={["Automatic follow-up timing", "Simple campaign tracking", "Your review link, your voice"]} href="/review-booster" /><FeatureCard icon={Search} accent="yellow" label="Local visibility" title="Keep your profile complete" body="Turn the overlooked details of your Google Business Profile into clear, actionable visibility work." bullets={["Profile completeness checks", "Local content ideas", "Practical next steps"]} href="/local-seo" /></div></div></section>

    <section className="bg-navy-900 py-20 md:py-24"><div className="mx-auto max-w-7xl space-y-20 px-4 md:px-6 lg:px-8"><div className="grid items-center gap-12 lg:grid-cols-2"><div><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-accent-purple"><MessageSquare className="h-5 w-5" /></div><Eyebrow light>Review Replies</Eyebrow><h2 className="mt-3 text-3xl font-bold text-slate-50 sm:text-4xl">Every review answered, every time.</h2><p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-300">Turn an empty inbox into a clear, human review workflow. Ornigami drafts the response, you keep the final say.</p><ul className="mt-6 space-y-3 text-sm text-slate-300">{["A full review inbox in one clean view", "Tone and context that carry through each draft", "Approve-first workflows for peace of mind"].map((item) => <li key={item} className="flex items-start gap-2.5"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-accent-purple"><Check className="h-3 w-3" /></span>{item}</li>)}</ul><Button className="mt-8" variant="secondary" asChild><Link href="/review-replies">See Review Replies <ArrowRight className="h-4 w-4" /></Link></Button></div><RestoredReviewRepliesMockup /></div><div className="grid items-center gap-12 lg:grid-cols-2"><RestoredReviewBoosterMockup /><div><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-accent-green"><Star className="h-5 w-5" /></div><Eyebrow light>Review Booster</Eyebrow><h2 className="mt-3 text-3xl font-bold text-slate-50 sm:text-4xl">Turn good visits into lasting trust.</h2><p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-300">A simple follow-up loop helps satisfied customers remember to share what they loved.</p><ul className="mt-6 space-y-3 text-sm text-slate-300">{["Log visits or upload a CSV", "Send a thoughtful follow-up after the visit", "Track sends and new reviews in one place"].map((item) => <li key={item} className="flex items-start gap-2.5"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-accent-green"><Check className="h-3 w-3" /></span>{item}</li>)}</ul><Button className="mt-8" variant="secondary" asChild><Link href="/review-booster">See Review Booster <ArrowRight className="h-4 w-4" /></Link></Button></div></div></div></section>

    <section className="bg-white py-20 md:py-24"><div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8"><SectionHeading eyebrow="Product storytelling" title="A normal day, handled." intro="Illustrative workflow examples — not customer testimonials — showing how Ornigami fits around the work already happening." align="center" /><div className="mt-12 grid gap-5 md:grid-cols-3"><motion.article whileHover={{ y: -3 }} className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent-purple"><MessageSquare className="h-5 w-5" /></div><h3 className="mt-5 text-xl font-semibold text-primary">Morning</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">A 4-star review arrives → a thoughtful draft is ready before the first appointment.</p><p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Example workflow</p></motion.article><motion.article whileHover={{ y: -3 }} className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent-green"><Clock3 className="h-5 w-5" /></div><h3 className="mt-5 text-xl font-semibold text-primary">Afternoon</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">A completed visit triggers a friendly follow-up while the experience is still fresh.</p><p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Example workflow</p></motion.article><motion.article whileHover={{ y: -3 }} className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent-yellow"><BarChart3 className="h-5 w-5" /></div><h3 className="mt-5 text-xl font-semibold text-primary">Evening</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">A quick glance shows what is answered, what is pending, and what deserves your attention.</p><p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Example workflow</p></motion.article></div></div></section>

    <section className="bg-surface py-20 md:py-24"><div className="mx-auto max-w-3xl px-4 md:px-6"><SectionHeading eyebrow="Questions" title="Clear answers before you start." align="center" /><div className="mt-10 space-y-3">{faqs.map(([question, answer]) => <FAQItem key={question} question={question} answer={answer} />)}</div></div></section>
    <CTASection title="Make local growth easier to run." body="Start with one focused workspace for reviews, follow-ups, and visibility. 14-day free trial, no card required." />
  </main>;
}
