import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Check, X } from "lucide-react";

export const metadata = {
  title: "Pricing , LocalLift",
  description: "One simple plan for local business growth. Start your 7-day free trial.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-16 md:px-6 lg:px-8">
        {/* HERO */}
        <section className="text-center">
          <div className="mb-5 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-600">
            Pricing
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            One simple plan for local growth
          </h1>
          <p className="mt-4 text-lg text-slate-500">
            Start your 7-day free trial. No credit card, no setup fees. Cancel anytime.
          </p>

          <div className="mt-8 flex items-baseline justify-center gap-1.5">
            <span className="text-5xl font-bold tracking-tight text-slate-900">$14.99</span>
            <span className="text-lg text-slate-500">/ month</span>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-100 transition-all hover:brightness-105"
            >
              Start free trial
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
            >
              Try live demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            7-day free trial Â· Cancel anytime Â· No long-term contracts
          </p>
        </section>

        {/* PLAN CARD */}
        <section className="mt-16">
          <div className="relative mx-auto max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-900">LocalLift Starter</h2>
              <p className="mt-2 text-sm text-slate-500">
                Everything you need to manage your Google reviews and local content.
              </p>
              <div className="mt-5 flex items-baseline justify-center gap-1.5">
                <span className="text-4xl font-bold text-slate-900">$14.99</span>
                <span className="text-sm text-slate-500">/ month</span>
              </div>
            </div>

            <ul className="mt-8 space-y-4 text-sm text-slate-700">
              {[
                "AI replies for all your Google reviews",
                "20 content pieces per month (blogs + Google posts + FAQs)",
                "5 profile audits per month",
                "Unlimited manual review replies",
                "Review Booster , automated follow-up campaigns",
                "Google Business Profile connection and review sync",
                "Access to the free profile audit tool",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Link
                href="/signup"
                className="block w-full rounded-xl bg-slate-900 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Start free trial
              </Link>
              <p className="mt-4 text-center text-xs text-slate-400">
                Need higher limits or agency features?{" "}
                <a href="mailto:support@locallift.com" className="underline hover:text-slate-600">
                  Contact us
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight text-slate-900">
            Before and after LocalLift
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="mb-4 text-sm font-semibold text-slate-400">Without LocalLift</h3>
              <ul className="space-y-3 text-sm text-slate-500">
                {[
                  "Manually replying to every review",
                  "No idea what to post on Google",
                  "Inconsistent local SEO , ranking slips",
                  "Happy customers leave without reviewing",
                  "Profile issues go unnoticed for months",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <X className="h-5 w-5 shrink-0 text-slate-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="mb-4 text-sm font-semibold text-emerald-600">With LocalLift</h3>
              <ul className="space-y-3 text-sm text-emerald-800">
                {[
                  "AI drafts replies to every review in seconds",
                  "Local content ideas tailored to your city",
                  "Regular content keeps your ranking climbing",
                  "Automatic follow-ups turn visitors into reviewers",
                  "Ongoing audits catch issues before customers do",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto mt-24 max-w-3xl">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "Do I need a website to use LocalLift?",
                a: "No. You can use LocalLift even if you only have a Google Business Profile. We generate Google posts, review replies, and profile audits without needing a website.",
              },
              {
                q: "Can I try it without connecting my Google account?",
                a: "Yes. You can use the live demo with sample data, and you can run a free audit just by sharing your business profile link or name.",
              },
              {
                q: "What happens when I hit my monthly limits?",
                a: "You can still log in and see your data, but new content and audits will pause until your monthly usage resets. Contact us if you need more volume.",
              },
              {
                q: "What is the Review Booster?",
                a: "Review Booster is an agent that sends follow-up messages to your customers after their visit, asking them to leave a Google review. You log the visit, and the agent handles the outreach.",
              },
              {
                q: "Will LocalLift post anything without my approval?",
                a: "No. Everything is approve-first by default. You see every draft before it goes live. Automation is opt-in.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. You can manage your subscription from the billing portal and cancel at any time. Your data remains accessible.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="font-semibold text-slate-900">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mt-24 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center md:p-12">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Not ready to commit?
          </h2>
          <p className="mt-3 text-slate-500">
            Start with a free profile audit, then upgrade when LocalLift proves its value.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/free-audit"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Run a free audit
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Start free trial
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

