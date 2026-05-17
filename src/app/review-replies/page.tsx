"use client";

import { motion } from "motion/react";
import Link from "next/link";
import {
  MessageSquare,
  Check,
  ArrowRight,
  Star,
  Zap,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Header } from "@/components/marketing/Header";

// â”€â”€â”€ MOCKUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InboxMockup() {
  const reviews = [
    {
      stars: 5,
      author: "Sarah M.",
      time: "2h ago",
      text: "The staff was so warm and the food was incredible. Will definitely be back soon!",
      draft: "Thank you so much, Sarah! We're thrilled to hear you had a wonderful experience. Our team works hard to make every visit special , we look forward to welcoming you back!",
      status: "pending" as const,
    },
    {
      stars: 4,
      author: "James K.",
      time: "5h ago",
      text: "Great food and good service. Parking outside was a bit of a nightmare though.",
      draft: "Thanks for the kind words, James! We appreciate your feedback on parking , it's something we hear from time to time and we'll keep it in mind.",
      status: "pending" as const,
    },
    {
      stars: 5,
      author: "Luna R.",
      time: "Yesterday",
      text: "Best brunch spot in the city. The avocado toast is a must.",
      draft: null,
      status: "replied" as const,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500/60" />
            <span className="h-3 w-3 rounded-full bg-amber-500/60" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/60" />
          </div>
          <span className="ml-2 text-xs text-slate-400">Review Inbox , LocalLift</span>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          â. Google synced
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-2">
        <div className="flex gap-2">
          {["All", "Pending", "Replied"].map((tab, i) => (
            <button
              key={tab}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${i === 0 ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-500">3 reviews Â· 2 need replies</span>
      </div>

      {/* Review list */}
      <div className="divide-y divide-slate-800/60">
        {reviews.map((r, idx) => (
          <div key={idx} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-300">
                    {r.author.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-200">{r.author}</span>
                      <span className="text-[10px] text-amber-400">{"*".repeat(r.stars)}</span>
                      <span className="text-[10px] text-slate-600">Â·</span>
                      <span className="text-[10px] text-slate-500">{r.time}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{r.text}</p>
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                {r.status === "replied" ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                    âœ“ Replied
                  </span>
                ) : (
                  <button className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 transition-colors hover:bg-white">
                    Approve
                  </button>
                )}
              </div>
            </div>

            {r.draft && (
              <div className="mt-3 rounded-xl border border-purple-500/25 bg-purple-500/5 p-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-purple-400" />
                  <span className="text-[10px] font-semibold text-purple-400">AI draft</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">{r.draft}</p>
                <div className="mt-2 flex gap-2">
                  <button className="rounded-lg bg-purple-500 px-2.5 py-1 text-[10px] font-semibold text-white">
                    Approve & send
                  </button>
                  <button className="rounded-lg border border-slate-700 px-2.5 py-1 text-[10px] font-medium text-slate-400">
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€â”€ PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const features = [
  {
    icon: MessageSquare,
    gradient: "from-purple-500 to-sky-400",
    title: "One clean review inbox",
    description:
      "All your Google reviews in one place. No switching tabs, no copy-pasting , just a simple inbox where you can see, manage, and reply to every review.",
  },
  {
    icon: Zap,
    gradient: "from-orange-400 to-pink-500",
    title: "AI drafts in seconds",
    description:
      "Our AI reads the review context, your business info, and your tone preferences to generate a reply that sounds like you , not a template.",
  },
  {
    icon: Check,
    gradient: "from-emerald-400 to-teal-500",
    title: "Approve and post in one click",
    description:
      "Like the draft? Hit approve and it posts straight to Google. Want to tweak it? Edit inline before sending. Always in control.",
  },
  {
    icon: RefreshCw,
    gradient: "from-sky-400 to-indigo-500",
    title: "Automatic review sync",
    description:
      "New reviews appear in your inbox automatically. No manual imports, no browser extensions , just connect your Google Business Profile and we handle the rest.",
  },
  {
    icon: Star,
    gradient: "from-amber-400 to-orange-500",
    title: "Learn your brand voice",
    description:
      "The more you use LocalLift, the better it understands your style. Replies become more accurate and personal over time.",
  },
  {
    icon: Shield,
    gradient: "from-violet-500 to-purple-600",
    title: "Always approve first",
    description:
      "Nothing goes live without your say. Every reply is a draft first. Automation is opt-in , you decide how much control to keep.",
  },
];

const steps = [
  {
    number: "01",
    title: "Connect your Google Business Profile",
    body: "Sign in with Google and authorize LocalLift to access your reviews. Takes less than two minutes.",
  },
  {
    number: "02",
    title: "Tell us your tone and preferences",
    body: "Choose a voice (professional, friendly, warm), set your preferred reply length, and add any notes about your business.",
  },
  {
    number: "03",
    title: "Approve replies and go live",
    body: "New reviews appear with AI drafts ready. Approve, edit, or skip , then watch your reply rate hit 100%.",
  },
];

export default function ReviewRepliesPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative overflow-hidden bg-white pb-24 pt-16">
        <div className="pointer-events-none absolute -left-48 -top-24 h-[500px] w-[500px] rounded-full bg-purple-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-20 h-[400px] w-[400px] rounded-full bg-sky-100/40 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="mb-14 max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3.5 py-1.5 text-xs font-semibold text-purple-700"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Review Replies Agent
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl"
            >
              Reply to every review{" "}
              <span className="bg-gradient-to-r from-purple-600 to-sky-500 bg-clip-text text-transparent">
                in seconds
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="mt-5 max-w-2xl text-xl leading-relaxed text-slate-600"
            >
              Our AI monitors your Google inbox and drafts personalized, on-brand replies for every review , so you can approve and send in one click, or let it run automatically.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-sky-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-200/70 transition-all hover:brightness-105"
              >
                Try it free <ArrowRight className="h-4 w-4" />
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
              {["7-day free trial", "No credit card required", "Cancel anytime"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Full-width mockup */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.2 }}
            className="mx-auto max-w-2xl"
          >
            <InboxMockup />
          </motion.div>
        </div>
      </section>

      {/* â”€â”€ FEATURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Features</p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Everything you need to manage reviews
            </h2>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, idx) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.07 }}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient}`}>
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ HOW IT WORKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-4xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Setup</p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Set up in under 5 minutes
            </h2>
          </motion.div>

          <div className="space-y-6">
            {steps.map((step, idx) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex gap-5 rounded-2xl border border-slate-100 bg-slate-50 p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-sky-400 text-sm font-bold text-white shadow-md">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative overflow-hidden bg-slate-950 py-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-950/60 via-slate-950 to-sky-950/40" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-2xl px-4 text-center md:px-6"
        >
          <h2 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Stop leaving reviews unanswered
          </h2>
          <p className="mt-5 text-lg text-slate-400">
            Every unanswered review is a missed opportunity. Start replying to all of them , automatically , with a 7-day free trial.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-sky-400 px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-105"
            >
              Try it free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-8 py-3.5 text-sm font-semibold text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              See a demo first
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Part of LocalLift Â· $14.99/month Â· 7-day free trial
          </p>
        </motion.div>
      </section>
    </div>
  );
}


