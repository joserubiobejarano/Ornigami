"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "Do I need a website to use Ornigami?",
    answer:
      "No. Ornigami works even if you only have a Google Business Profile. Connect your profile and we'll start replying to reviews right away.",
  },
  {
    question: "Can I use Ornigami if I manage multiple locations?",
    answer:
      "Not yet. The launch version supports one location per subscription; multi-location management is planned.",
  },
  {
    question: "Will the AI replies sound like my brand?",
    answer:
      "Yes. During onboarding we learn your tone of voice and preferred style. Ornigami uses that to draft replies that sound like you wrote them.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. You get a 14-day free trial with full access. No setup fees and you can cancel anytime.",
  },
  {
    question: "Which profiles do you support?",
    answer:
      "We start with Google Business Profile and are working on Apple Maps and other platforms. You'll be able to manage all key local profiles from one place.",
  },
];

export function FAQAccordion() {
  const [openFAQ, setOpenFAQ] = useState<string | null>(faqs[0]?.question ?? null);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {faqs.map((faq, index) => {
        const isOpen = openFAQ === faq.question;
        return (
          <motion.div
            key={faq.question}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
            className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 transition-colors duration-200 hover:border-slate-600"
          >
            <button
              onClick={() =>
                setOpenFAQ((prev) => (prev === faq.question ? null : faq.question))
              }
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-medium text-slate-50">{faq.question}</span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="answer"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-xs text-slate-300/85 sm:text-sm">
                    {faq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
