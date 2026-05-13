"use client";

import { motion } from "motion/react";
import Link from "next/link";
import {
  FileText,
  Check,
  ArrowRight,
  BookOpen,
  MapPin,
  HelpCircle,
  BarChart2,
  Sparkles,
  Edit3,
} from "lucide-react";
import { Header } from "@/components/marketing/Header";

// ─── MOCKUP ──────────────────────────────────────────────────────────────────

function ContentMockup() {
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
          <span className="ml-2 text-xs text-slate-400">Local SEO Content — LocalLift</span>
        </div>
        <button className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-1 text-[10px] font-semibold text-white">
          + Generate content
        </button>
      </div>

      {/* Content type tabs */}
      <div className="flex gap-0 border-b border-slate-800">
        {["Blog post", "GBP Post", "FAQ", "Audit"].map((tab, i) => (
          <button
            key={tab}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              i === 0
                ? "border-b-2 border-emerald-400 text-emerald-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Generated content */}
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-semibold text-emerald-400">Generated for you</span>
          </div>
          <span className="text-[10px] text-slate-500">Madrid · Italian restaurant</span>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Blog post</span>
          </div>
          <div className="mb-2 h-3 w-3/4 rounded-full bg-emerald-400/40" />
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-slate-700/50" />
            <div className="h-2 w-full rounded-full bg-slate-700/50" />
            <div className="h-2 w-4/5 rounded-full bg-slate-700/50" />
            <div className="h-2 w-full rounded-full bg-slate-700/40" />
            <div className="h-2 w-2/3 rounded-full bg-slate-700/40" />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold text-white">
              Copy content
            </button>
            <button className="rounded-lg border border-slate-700 px-2.5 py-1 text-[10px] font-medium text-slate-400">
              Regenerate
            </button>
          </div>
        </div>

        {/* Ideas list */}
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">More ideas for you</p>
          {[
            { type: "GBP Post", idea: "Weekend pasta special — limited spots", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
            { type: "FAQ", idea: "Do you offer gluten-free options?", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
            { type: "Blog", idea: "The best places for a date night in Malasaña", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
          ].map((item) => (
            <div key={item.idea} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${item.color}`}>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${item.color}`}>
                {item.type}
              </span>
              <span className="truncate text-[11px] text-slate-300">{item.idea}</span>
              <button className="ml-auto shrink-0 text-[10px] text-slate-500 hover:text-slate-300">
                Generate →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AUDIT MOCKUP ─────────────────────────────────────────────────────────────

function AuditMockup() {
  const checks = [
    { label: "Business name & category", score: 100, status: "ok" },
    { label: "Photos (min. 5 recommended)", score: 40, status: "warn" },
    { label: "Opening hours up to date", score: 100, status: "ok" },
    { label: "Business description", score: 0, status: "error" },
    { label: "Posts in last 30 days", score: 60, status: "warn" },
    { label: "Review response rate", score: 100, status: "ok" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">Profile Audit Report</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Score: 67/100</span>
      </div>
      <div className="divide-y divide-slate-50">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                c.status === "ok" ? "bg-emerald-400" : c.status === "warn" ? "bg-amber-400" : "bg-red-400"
              }`} />
              <span className="text-xs text-slate-700">{c.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    c.status === "ok" ? "bg-emerald-400" : c.status === "warn" ? "bg-amber-400" : "bg-red-400"
                  }`}
                  style={{ width: `${c.score}%` }}
                />
              </div>
              <span className="w-7 text-right text-[10px] font-semibold text-slate-500">{c.score}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 bg-emerald-50 px-4 py-3">
        <p className="text-xs text-emerald-700 font-medium">3 issues found · Fix them to improve your ranking</p>
      </div>
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: BookOpen,
    gradient: "from-emerald-400 to-teal-500",
    title: "Hyper-local blog posts",
    description:
      "Blog outlines and drafts written specifically for your city, neighbourhood, and niche. Local SEO content that actually ranks.",
  },
  {
    icon: MapPin,
    gradient: "from-orange-400 to-pink-500",
    title: "Google Business Profile posts",
    description:
      "Ready-to-publish updates for promotions, events, seasonal menus, and more. Keep your profile active without spending hours writing.",
  },
  {
    icon: HelpCircle,
    gradient: "from-sky-400 to-indigo-500",
    title: "FAQ ideas from real searches",
    description:
      "We generate FAQ content based on what people actually search for in your area — directly improving your Google visibility.",
  },
  {
    icon: BarChart2,
    gradient: "from-purple-500 to-fuchsia-500",
    title: "Profile audit & scoring",
    description:
      "A detailed audit of your Google Business Profile with a score and specific action steps. Know exactly what to fix to rank higher.",
  },
  {
    icon: Sparkles,
    gradient: "from-violet-500 to-purple-600",
    title: "Business-aware AI",
    description:
      "Content is generated with your business name, location, services, and tone in mind. Nothing generic — everything tailored.",
  },
  {
    icon: Edit3,
    gradient: "from-teal-400 to-emerald-600",
    title: "Edit before you publish",
    description:
      "All content is a starting point, not a final word. Edit, adjust, or use it as-is. Copy to clipboard and post wherever you need.",
  },
];

const steps = [
  {
    number: "01",
    title: "Tell us about your business",
    body: "Share your business name, location, services, and target customers during onboarding. The more detail, the more tailored the content.",
  },
  {
    number: "02",
    title: "Choose your content type",
    body: "Pick from blog post, Google Business Profile post, or FAQ. The AI generates a tailored draft in seconds.",
  },
  {
    number: "03",
    title: "Publish and rank higher",
    body: "Copy the content, edit if you want, and publish. Consistently fresh, locally relevant content helps your Google ranking improve over time.",
  },
];

export default function LocalSeoPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pb-24 pt-16">
        <div className="pointer-events-none absolute -left-48 -top-24 h-[500px] w-[500px] rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-20 h-[400px] w-[400px] rounded-full bg-teal-100/40 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="grid gap-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center">
            {/* Left — text */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700"
              >
                <FileText className="h-3.5 w-3.5" />
                Local SEO Content Agent
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl"
              >
                Local content that{" "}
                <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                  helps you rank
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.16 }}
                className="mt-5 max-w-xl text-xl leading-relaxed text-slate-600"
              >
                Blog posts, Google updates, and FAQ content written for your exact city, niche, and customers. Stay visible on Google without spending hours creating content.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.24 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition-all hover:brightness-105"
                >
                  Try it free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/free-audit"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  Run a free audit
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

            {/* Right — mockup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2 }}
            >
              <ContentMockup />
            </motion.div>
          </div>
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
              Everything you need to stay visible on Google
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

      {/* ── AUDIT SECTION ─────────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
            >
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Profile audit</p>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Know exactly why you&apos;re not ranking higher
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Our profile audit checks every element of your Google Business Profile and gives you a score with clear, actionable steps to improve it.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Missing hours, photos, descriptions, and links",
                  "Profile completeness score out of 100",
                  "Specific fixes with impact on local ranking",
                  "Also available as a free public audit — no account needed",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex gap-3">
                <Link
                  href="/free-audit"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-100 transition-all hover:brightness-105"
                >
                  Run a free audit <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <AuditMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-24">
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
              From prompt to published in minutes
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
                className="flex gap-5 rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-bold text-white shadow-md">
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
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-950/60 via-slate-950 to-teal-950/40" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-2xl px-4 text-center md:px-6"
        >
          <h2 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Start publishing local content that ranks
          </h2>
          <p className="mt-5 text-lg text-slate-400">
            Businesses that post regularly on their Google profile and blog get significantly more visibility. LocalLift makes it effortless.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-105"
            >
              Try it free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/free-audit"
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-8 py-3.5 text-sm font-semibold text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Run a free audit first
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
