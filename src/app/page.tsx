"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  MessageSquare,
  Star,
  FileText,
  Check,
  ArrowRight,
  ChevronDown,
  MapPin,
  Users,
  Send,
  Clock,
  Zap,
} from "lucide-react";
import { Header } from "@/components/marketing/Header";

// â”€â”€â”€ DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const agents = [
  {
    name: "Review Replies",
    tagline: "Reply to every review in seconds",
    description:
      "Our AI monitors your Google inbox and drafts personalized, on-brand replies. Approve in one click , or let it run automatically.",
    href: "/review-replies",
    icon: MessageSquare,
    gradient: "from-purple-500 to-sky-400",
    lightBg: "bg-purple-50",
    lightBorder: "border-purple-100",
    bullets: ["Full review inbox, one clean view", "AI replies that sound like you", "Post directly to Google"],
  },
  {
    name: "Review Booster",
    tagline: "Turn customers into 5-star reviewers",
    description:
      "After every visit, Review Booster sends a friendly follow-up asking for feedback. More reviews, more trust, higher Google rankings.",
    href: "/review-booster",
    icon: Star,
    gradient: "from-orange-400 to-pink-500",
    lightBg: "bg-orange-50",
    lightBorder: "border-orange-100",
    bullets: ["Automatic follow-up after each visit", "Smart timing for maximum response rate", "Track every campaign in real time"],
  },
  {
    name: "Local SEO Content",
    tagline: "Content that helps you show up first",
    description:
      "Blog posts, Google updates, and FAQ ideas written for your exact city, niche, and customer base , ready to publish in minutes.",
    href: "/local-seo",
    icon: FileText,
    gradient: "from-emerald-400 to-teal-500",
    lightBg: "bg-emerald-50",
    lightBorder: "border-emerald-100",
    bullets: ["Hyper-local blog drafts", "Google Business Profile posts", "FAQ ideas from real search data"],
  },
];

const steps = [
  {
    number: "01",
    title: "Connect your Google Business Profile",
    body: "Link your profile in a few clicks. No technical setup, no spreadsheets , just sign in and we take it from there.",
    gradient: "from-purple-500 to-sky-400",
  },
  {
    number: "02",
    title: "We learn your tone and sync your reviews",
    body: "Our AI reads your business info and past reviews to understand your voice. Your review inbox syncs automatically.",
    gradient: "from-orange-400 to-pink-500",
  },
  {
    number: "03",
    title: "Three agents handle the rest",
    body: "Replies go out, follow-ups get sent, content stays fresh. You stay in control and approve anything before it goes live.",
    gradient: "from-emerald-400 to-teal-500",
  },
];

const testimonials = [
  {
    name: "Marta Ruiz",
    role: "Owner",
    business: "BurgerMat Â· Madrid",
    text: "Before LocalLift, I'd reply to reviews from my phone between orders. Now every review gets a thoughtful answer without me staying up late.",
    stars: 5,
  },
  {
    name: "Dr. Alex Carter",
    role: "Clinic manager",
    business: "Smiles & Co Dental Â· London",
    text: "We get a lot of anxious patients reading our reviews first. LocalLift helps us answer fast and keep the tone warm and professional.",
    stars: 5,
  },
  {
    name: "Nina LÃ³pez",
    role: "Marketing lead",
    business: "UrbanFit Gym Â· Barcelona",
    text: "Our team was too busy to keep the Google profile updated. Now we have fresh posts each week and reviews are always replied to.",
    stars: 5,
  },
];

const faqs = [
  {
    q: "Do I need a website to use LocalLift?",
    a: "No. LocalLift works even if you only have a Google Business Profile. Connect your profile and we'll start replying to reviews and generating content right away.",
  },
  {
    q: "Will the AI replies sound like my brand?",
    a: "Yes. During onboarding we learn your preferred tone, business personality, and style. Drafts sound like you , not like a robot.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. You get a 7-day free trial with full access. No credit card required and you can cancel anytime.",
  },
  {
    q: "What is the Review Booster and how does it work?",
    a: "Review Booster sends a short follow-up message to customers after their visit, asking them to leave a review on Google. You log the visit (or upload a CSV), and the agent handles the outreach.",
  },
  {
    q: "Will LocalLift post anything without my approval?",
    a: "No. Everything is approve-first by default. You see the draft, make any edits, and decide what goes live. Automation is opt-in.",
  },
  {
    q: "Can I manage multiple locations?",
    a: "Yes. You can connect multiple Google Business Profiles and manage all their reviews and content from a single dashboard.",
  },
];

// â”€â”€â”€ HERO MOCKUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReviewInboxMockup() {
  return (
    <div className="relative select-none">
      {/* Depth layers */}
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-slate-100" />
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-2xl border border-slate-200 bg-slate-50" />

      {/* Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Top bar */}
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

        {/* Summary row */}
        <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
          <span className="text-xs text-slate-500">3 reviews today</span>
          <span className="text-xs font-semibold text-slate-700">100% reply rate</span>
        </div>

        {/* Review items */}
        <div className="space-y-0 divide-y divide-slate-100">
          {[
            {
              stars: 5,
              author: "Sarah M.",
              text: "Amazing food and the staff was so friendly!",
              replied: true,
            },
            {
              stars: 4,
              author: "James K.",
              text: "Great place, parking was a bit tricky but worth it.",
              replied: false,
            },
            {
              stars: 5,
              author: "Luna R.",
              text: "Best coffee in the neighborhood, will come back!",
              replied: false,
            },
          ].map((review, idx) => (
            <div key={idx} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-amber-400">{"*".repeat(review.stars)}</span>
                    <span className="text-[11px] font-medium text-slate-600">{review.author}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{review.text}</p>
                </div>
                {review.replied ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    âœ“ Sent
                  </span>
                ) : (
                  <button className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                    Approve
                  </button>
                )}
              </div>
              {!review.replied && (
                <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50 px-2.5 py-2">
                  <p className="mb-1 text-[10px] font-medium text-purple-400">AI draft ready</p>
                  <div className="h-1.5 w-full rounded-full bg-purple-200/60" />
                  <div className="mt-1 h-1.5 w-3/4 rounded-full bg-purple-100" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Stats footer */}
        <div className="border-t border-slate-100 bg-gradient-to-r from-purple-50 via-white to-orange-50 px-4 py-3">
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

// â”€â”€â”€ FEATURE MOCKUPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReviewRepliesMockup() {
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
          â. 12 new
        </span>
      </div>

      <div className="divide-y divide-slate-800">
        {[
          { stars: 5, author: "Maria G.", text: "Fantastic service! We had a wonderful evening.", accent: "purple" },
          { stars: 4, author: "Tom S.", text: "Great food, a little loud on weekends.", accent: "orange" },
          { stars: 5, author: "Ana R.", text: "My favourite spot in the whole city.", accent: "sky" },
        ].map((r, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-amber-400">{"*".repeat(r.stars)}</span>
                  <span className="text-[11px] font-medium text-slate-300">{r.author}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{r.text}</p>
              </div>
              <button className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-900">
                Approve
              </button>
            </div>
            <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5">
              <p className="mb-1 text-[10px] font-medium text-purple-400">AI reply ready â†’</p>
              <div className="h-1.5 w-full rounded-full bg-purple-500/25" />
              <div className="mt-1 h-1.5 w-2/3 rounded-full bg-purple-500/15" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewBoosterMockup() {
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
        <button className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-2.5 py-1 text-[10px] font-semibold text-white">
          â–¶ Run campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800">
        {[
          { label: "Visits", value: "24" },
          { label: "Follow-ups", value: "8" },
          { label: "New reviews", value: "5" },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3 text-center">
            <p className="text-base font-bold text-slate-100">{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Customer list */}
      <div className="divide-y divide-slate-800">
        {customers.map((c, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
                {c.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">{c.name}</p>
                <p className="text-[10px] text-slate-500">{c.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {c.review && (
                <span className="text-[10px] text-amber-400">*****</span>
              )}
              {c.status === "sent" ? (
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

// â”€â”€â”€ FAQ ITEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 transition-colors hover:border-slate-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-slate-100">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm leading-relaxed text-slate-400">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// â”€â”€â”€ PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative overflow-hidden bg-white pb-24 pt-16">
        {/* Background blobs */}
        <div className="pointer-events-none absolute -left-48 -top-24 h-[500px] w-[500px] rounded-full bg-purple-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-20 h-[400px] w-[400px] rounded-full bg-orange-100/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-sky-100/30 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="grid gap-14 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center">
            {/* Left , text */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-600"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                AI-powered local reputation management
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl"
              >
                Your local reputation,{" "}
                <span className="bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 bg-clip-text text-transparent">
                  on autopilot
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.16 }}
                className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600"
              >
                Three AI agents that reply to your Google reviews, generate new ones from happy customers, and keep your profile fully optimized , so you show up first and win more business.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.24 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200/70 transition-all hover:brightness-105 hover:shadow-orange-200"
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
                  7-day free trial
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  No credit card required
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Cancel anytime
                </span>
              </motion.div>
            </div>

            {/* Right , mockup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2 }}
              className="w-full max-w-sm md:max-w-none"
            >
              <ReviewInboxMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* â”€â”€ AGENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              The platform
            </p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Three agents. One platform.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              Each agent handles a specific part of your local presence, running automatically in the background while you focus on your business.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {agents.map((agent, idx) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -4 }}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${agent.gradient}`}
                >
                  <agent.icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {agent.name}
                </p>
                <h3 className="mt-1.5 text-lg font-semibold text-slate-900">{agent.tagline}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{agent.description}</p>
                <ul className="mt-4 space-y-2">
                  {agent.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex-1 flex items-end">
                  <Link
                    href={agent.href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 transition-colors group-hover:text-slate-900"
                  >
                    Learn more <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ HOW IT WORKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              Setup
            </p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Up and running in minutes
            </h2>
          </motion.div>

          <div className="relative grid gap-8 md:grid-cols-3">
            {/* Connector line (desktop) */}
            <div className="absolute left-[16.66%] right-[16.66%] top-8 hidden h-px bg-gradient-to-r from-purple-200 via-orange-200 to-emerald-200 md:block" />

            {steps.map((step, idx) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.12 }}
                className="relative flex flex-col items-center text-center"
              >
                <div
                  className={`relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${step.gradient} shadow-md`}
                >
                  <span className="text-lg font-bold text-white">{step.number}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ FEATURE SHOWCASE (dark band) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-slate-950 py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">

          {/* Review Replies */}
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
            >
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-purple-400">
                Review Replies agent
              </p>
              <h2 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
                Every review answered, every time
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                Stop leaving reviews unanswered. Our agent monitors your Google inbox, drafts personalized responses in your brand voice, and waits for your approval , or sends automatically.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: MessageSquare, text: "One clean inbox for all your Google reviews" },
                  { icon: Zap, text: "AI drafts ready in seconds, not hours" },
                  { icon: Check, text: "Approve in one click and post directly to Google" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                      <item.icon className="h-3 w-3 text-purple-400" />
                    </div>
                    <span className="text-sm text-slate-300">{item.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/review-replies"
                  className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-5 py-2.5 text-sm font-semibold text-purple-300 transition-all hover:bg-purple-500/20"
                >
                  See how it works <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <ReviewRepliesMockup />
            </motion.div>
          </div>

          {/* Divider */}
          <div className="my-20 h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

          {/* Review Booster */}
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="md:order-2"
            >
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-orange-400">
                Review Booster agent
              </p>
              <h2 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
                Turn customers into 5-star reviewers
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                Most happy customers don&apos;t leave reviews , they just forget. Review Booster sends a short follow-up after every visit and asks for feedback at exactly the right moment.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: Users, text: "Log visits manually or import via CSV" },
                  { icon: Send, text: "Personalised follow-up messages sent automatically" },
                  { icon: Clock, text: "Smart timing for the highest response rate" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                      <item.icon className="h-3 w-3 text-orange-400" />
                    </div>
                    <span className="text-sm text-slate-300">{item.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/review-booster"
                  className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-5 py-2.5 text-sm font-semibold text-orange-300 transition-all hover:bg-orange-500/20"
                >
                  See how it works <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="md:order-1"
            >
              <ReviewBoosterMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* â”€â”€ TESTIMONIALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              Testimonials
            </p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Trusted by local business owners
            </h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t, idx) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="mb-3 text-sm text-amber-400">
                  {"*".repeat(t.stars)}
                </div>
                <p className="flex-1 text-sm leading-relaxed text-slate-700">&ldquo;{t.text}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-200 to-orange-200 text-xs font-semibold text-slate-700">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.business}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ LOCAL PRESENCE STRIP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid gap-10 rounded-2xl border border-slate-200 bg-white p-8 md:grid-cols-2 md:items-center md:p-12"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
                <MapPin className="h-3.5 w-3.5" /> Built for local business
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                If customers find you on Google Maps, LocalLift can help
              </h2>
              <p className="mt-4 text-slate-600">
                Restaurants, salons, clinics, gyms, service businesses , any local business that depends on Google reviews and visibility can use LocalLift from day one.
              </p>
              <Link
                href="/signup"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-100 transition-all hover:brightness-105"
              >
                Start your free trial <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Restaurants", emoji: "ðŸ½ï¸" },
                { label: "Clinics", emoji: "ðŸ¥" },
                { label: "Salons & Spas", emoji: "âœ‚ï¸" },
                { label: "Gyms", emoji: "ðŸ’ª" },
                { label: "Local services", emoji: "ðŸ”§" },
                { label: "Retail stores", emoji: "ðŸ›ï¸" },
              ].map(({ label, emoji }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <span className="text-lg">{emoji}</span>
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* â”€â”€ FAQ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="bg-slate-950 py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">FAQ</p>
            <h2 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
              Common questions
            </h2>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                <FAQItem q={faq.q} a={faq.a} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ FINAL CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative overflow-hidden bg-white py-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-orange-50" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-3xl px-4 text-center md:px-6"
        >
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Ready to grow your local reputation?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
            Start your 7-day free trial today. No credit card, no setup fees , just three AI agents working for your business from day one.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition-all hover:brightness-105"
            >
              Try it free , 7 days on us
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
            >
              See a live demo first
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            $14.99/month after trial Â· Cancel anytime Â· No long-term contracts
          </p>
        </motion.div>
      </section>
    </div>
  );
}


