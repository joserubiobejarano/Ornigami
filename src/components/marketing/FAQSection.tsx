"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { FloatingDots } from "./FloatingDots";

const faqs = [
  {
    question: "Do I need a website to use Ornigami?",
    answer:
      "No. Ornigami works even if you only have a Google Business Profile. You can connect your profile and start replying to reviews right away.",
  },
  {
    question: "Can I use Ornigami if I manage multiple locations?",
    answer:
      "Not yet. The launch version supports one location per subscription; multi-location management is planned.",
  },
  {
    question: "Will the AI replies sound like my brand?",
    answer:
      "You can set tone and guidelines, then Ornigami follows them for every reply. You can also edit any draft before sending it.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. You get a 14-day free trial to connect your profile, test content, and see if Ornigami fits your workflow.",
  },
  {
    question: "Can I stop anytime?",
    answer:
      "Yes. There are no long term contracts. You can cancel in a few clicks from your billing settings.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative bg-white py-24 overflow-hidden">
      <FloatingDots count={15} size="w-2.5 h-2.5" color="bg-[#6366F1]/15" />

      {/* Decorative circle */}
      <div className="absolute bottom-10 right-[10%] w-64 h-64 border border-[#14B8A6]/10 rounded-full pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6">
        {/* Top copy */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-block px-4 py-1.5 bg-[#FAF5FF] border border-[#E5E7EB] rounded-full mb-4 text-[#111827] text-sm font-medium"
          >
            FAQ
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#111827]"
          >
            Stuff people ask before they start
          </motion.h2>
        </div>

        {/* FAQ items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="border-2 border-[#E5E7EB] rounded-xl overflow-hidden hover:border-[#6366F1]/30 transition-colors"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 hover:bg-[#FAF5FF]/50 transition-colors"
                  aria-expanded={isOpen}
                >
                  <h3 className="text-lg font-semibold text-[#111827] pr-4">
                    {faq.question}
                  </h3>
                  <ChevronDown
                    className={`w-5 h-5 text-[#6366F1] flex-shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5">
                      <p className="text-[#111827]/70 leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

