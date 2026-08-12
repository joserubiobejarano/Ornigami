"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FloatingDots } from "./FloatingDots";

type TabKey = "replies" | "content" | "audit";

const tabData = {
  replies: {
    headline: "Reply to every review in seconds",
    body: "Turn your Google review inbox into a handled list. Ornigami drafts on brand replies instantly so you can approve and send in one click.",
    bullets: [
      "Inbox style view of all your reviews in one place",
      "Drafted replies that match your tone",
      "Queue or send replies directly to Google",
    ],
  },
  content: {
    headline: "Turn searchers into regulars with local content",
    body: "Stop guessing what to post. Ornigami writes blog ideas, GBP posts, and FAQ content tailored to your city, niche, and customers.",
    bullets: [
      "Blog outlines and drafts based on your city and services",
      "Ready to post Google Business updates for promos and events",
      "FAQ ideas that answer what people actually search",
    ],
  },
  audit: {
    headline: "Know exactly what to fix on your profile",
    body: "Run a quick audit and get a checklist of improvements, from your business name and categories to photos and opening hours.",
    bullets: [
      "Score your profile in seconds",
      "See priority fixes that move the needle first",
      "Get name, description, and category suggestions",
    ],
  },
};

export function FeatureShowcase() {
  const [activeTab, setActiveTab] = useState<TabKey>("replies");

  return (
    <section className="relative bg-white py-24 overflow-hidden">
      <FloatingDots count={15} size="w-2.5 h-2.5" color="bg-[#6366F1]/15" />

      {/* Decorative circle */}
      <div className="absolute bottom-10 right-[10%] w-64 h-64 border border-[#14B8A6]/10 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Top copy */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-block px-4 py-1.5 bg-[#FAF5FF] border border-[#F97316]/20 rounded-full mb-4 text-[#F97316] text-sm font-medium"
          >
            Your toolkit
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-[#111827]"
          >
            Everything your Google Business Profile needs in one place
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-[#111827]/70 max-w-2xl mx-auto"
          >
            Switch between features to see how Ornigami keeps your review workflow organized.
          </motion.p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex gap-2 p-1 bg-[#F3F4F6] rounded-full">
            {(["replies", "content", "audit"] as TabKey[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={activeTab === tab}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-[#6366F1] text-white shadow-sm"
                    : "text-[#111827] hover:bg-white/50"
                }`}
              >
                {tab === "replies"
                  ? "Review replies"
                  : tab === "content"
                  ? "Local SEO content"
                  : "Profile audits"}
              </button>
            ))}
          </div>
        </div>

        {/* Content card */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white border-2 border-[#E5E7EB] rounded-2xl p-8 md:p-12 grid md:grid-cols-2 gap-8 md:gap-12"
        >
          {/* Left: Text content */}
          <div>
            <h3 className="text-2xl md:text-3xl font-bold mb-4 text-[#111827]">
              {tabData[activeTab].headline}
            </h3>
            <p className="text-lg text-[#111827]/70 mb-6 leading-relaxed">
              {tabData[activeTab].body}
            </p>
            <ul className="space-y-3">
              {tabData[activeTab].bullets.map((bullet, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6366F1] mt-2 flex-shrink-0" />
                  <span className="text-[#111827]/70">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Mock screenshot */}
          <div className="relative">
            <div className="w-full h-full min-h-[300px] rounded-xl bg-gradient-to-br from-[#6366F1]/20 via-[#14B8A6]/20 to-[#F97316]/20 p-8 flex flex-col gap-4">
              {/* Mock UI elements */}
              <div className="h-3 rounded bg-white/70 w-3/4" />
              <div className="h-3 rounded bg-white/70 w-1/2" />
              <div className="h-3 rounded bg-white/70 w-2/3" />
              <div className="mt-4 space-y-2">
                <div className="h-2 rounded bg-white/60 w-full" />
                <div className="h-2 rounded bg-white/60 w-5/6" />
                <div className="h-2 rounded bg-white/60 w-4/6" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="h-16 rounded bg-white/50" />
                <div className="h-16 rounded bg-white/50" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

