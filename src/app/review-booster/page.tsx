"use client";

import { motion } from "motion/react";
import Link from "next/link";
import {
  Star,
  Check,
  ArrowRight,
  Users,
  Send,
  Clock,
  TrendingUp,
  Upload,
  Bell,
} from "lucide-react";
import { Header } from "@/components/marketing/Header";

// ─── MOCKUP ──────────────────────────────────────────────────────────────────

function BoosterMockup() {
  const customers = [
    { name: "Maria G.", visit: "Today, 2:30 pm", status: "sent", stars: 5 },
    { name: "Tom S.", visit: "Today, 11:00 am", status: "pending", stars: null },
    { name: "Ana R.", visit: "Yesterday, 7:15 pm", status: "sent", stars: 4 },
    { name: "Luis P.", visit: "Yesterday, 4:00 pm", status: "pending", stars: null },
    { name: "Zara M.", visit: "2 days ago", status: "sent", stars: 5 },
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
          <span className="ml-2 text-xs text-slate-400">Review Booster — LocalLift</span>
        </div>
        <button className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-3 py-1 text-[10px] font-semibold text-white">
          ▶ Run campaign
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 divide-x divide-slate-800 border-b border-slate-800 bg-slate-900/50">
        {[
          { label: "Visits logged", value: "24" },
          { label: "Follow-ups sent", value: "18" },
          { label: "New reviews", value: "11" },
          { label: "Avg. stars", value: "4.8★" },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3 text-center">
            <p className="text-sm font-bold text-slate-100">{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-slate-800/60 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Customer</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Status</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Review</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-800/40">
        {customers.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
                {c.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">{c.name}</p>
                <p className="text-[10px] text-slate-500">{c.visit}</p>
              </div>
            </div>
            <div>
              {c.status === "sent" ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  ✉ Sent
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                  Pending
                </span>
              )}
            </div>
            <div>
              {c.stars ? (
                <span className="text-xs text-amber-400">{"★".repeat(c.stars)}</span>
              ) : (
                <span className="text-[10px] text-slate-600">—</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 bg-gradient-to-r from-orange-950/30 to-pink-950/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Response rate this week</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-[61%] rounded-full bg-gradient-to-r from-orange-400 to-pink-500" />
            </div>
            <span className="text-xs font-bold text-slate-200">61%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Users,
    gradient: "from-orange-400 to-pink-500",
    title: "Log visits easily",
    description:
      "Add customers manually one by one, or import a CSV list of recent visitors. The agent takes it from there and queues follow-ups automatically.",
  },
  {
    icon: Send,
    gradient: "from-purple-500 to-pink-500",
    title: "Personalised follow-up messages",
    description:
      "Follow-up messages are written with your business name and a friendly tone — not a generic template. Customers feel seen, not spammed.",
  },
  {
    icon: Clock,
    gradient: "from-sky-400 to-indigo-500",
    title: "Smart send timing",
    description:
      "Messages go out at the right time after each visit — not immediately, not days later. We optimise timing to maximise response rates.",
  },
  {
    icon: TrendingUp,
    gradient: "from-emerald-400 to-teal-500",
    title: "Real-time campaign tracking",
    description:
      "See exactly how many follow-ups were sent, how many led to a review, and your average star rating — all in one dashboard.",
  },
  {
    icon: Upload,
    gradient: "from-violet-500 to-purple-600",
    title: "CSV import for bulk visits",
    description:
      "Have a week's worth of customers in a spreadsheet? Upload a CSV and the agent queues all the follow-ups in seconds.",
  },
  {
    icon: Bell,
    gradient: "from-amber-400 to-orange-500",
    title: "New review notifications",
    description:
      "Every time a customer you followed up with leaves a review, you get notified. See the direct impact of each campaign in real time.",
  },
];

const steps = [
  {
    number: "01",
    title: "Log your customer visits",
    body: "Add visits manually or upload a CSV. Include the customer's name and contact info (email or phone) and the date of their visit.",
  },
  {
    number: "02",
    title: "Review Booster sends the follow-up",
    body: "At the right moment after the visit, a friendly message goes out asking the customer to share their experience on Google.",
  },
  {
    number: "03",
    title: "New reviews land on your profile",
    body: "Happy customers leave reviews. You see them in your LocalLift dashboard and the Review Replies agent can draft responses automatically.",
  },
];

export default function ReviewBoosterPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pb-24 pt-16">
        <div className="pointer-events-none absolute -left-48 -top-24 h-[500px] w-[500px] rounded-full bg-orange-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-20 h-[400px] w-[400px] rounded-full bg-pink-100/40 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="mb-14 max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold text-orange-700"
            >
              <Star className="h-3.5 w-3.5" />
              Review Booster Agent
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl"
            >
              Turn happy customers{" "}
              <span className="bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
                into 5-star reviews
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="mt-5 max-w-2xl text-xl leading-relaxed text-slate-600"
            >
              Most happy customers don&apos;t leave reviews — they just forget. Review Booster sends a short, personalised follow-up after every visit and asks for feedback at exactly the right moment.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200/70 transition-all hover:brightness-105"
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
            <BoosterMockup />
          </motion.div>
        </div>
      </section>

      {/* ── WHY IT MATTERS ────────────────────────────────────────────────── */}
      <section className="bg-slate-950 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
              The problem
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
              72% of customers will leave a review — if you ask them
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
              The problem isn&apos;t that your customers are unhappy. It&apos;s that no one asks. Review Booster fixes that — automatically, at scale, without feeling spammy.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { stat: "3x", label: "More reviews per month on average" },
                { stat: "61%", label: "Average follow-up response rate" },
                { stat: "4.7★", label: "Average rating from boosted reviews" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                  <p className="text-4xl font-bold text-slate-50">{s.stat}</p>
                  <p className="mt-1.5 text-sm text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
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
              Everything you need to grow your reviews
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

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-4xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">How it works</p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              From visit to review in three steps
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
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 text-sm font-bold text-white shadow-md">
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

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950 py-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-950/60 via-slate-950 to-pink-950/40" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-2xl px-4 text-center md:px-6"
        >
          <h2 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Start collecting more reviews today
          </h2>
          <p className="mt-5 text-lg text-slate-400">
            Most businesses could have 3× more reviews with a simple follow-up. Review Booster makes it automatic — try it free for 7 days.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-105"
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
            Part of LocalLift · $14.99/month · 7-day free trial
          </p>
        </motion.div>
      </section>
    </div>
  );
}
