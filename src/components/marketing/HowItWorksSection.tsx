"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingDots } from "./FloatingDots";

const steps = [
  {
    number: 1,
    title: "Connect your Google Business Profile",
    description: "Link your GBP in a few clicks so LocalLift can pull in your reviews and business details.",
    color: "#F97316",
  },
  {
    number: 2,
    title: "Sync your reviews and local data",
    description:
      "Your reviews, business info, and insights update automatically , no manual input.",
    color: "#FB923C",
  },
  {
    number: 3,
    title: "Create content & replies from one dashboard",
    description: "Generate AI-powered review replies, blog ideas, and Google posts from a single place.",
    color: "#4F46E5",
  },
];

export function HowItWorksSection() {
  return (
    <section className="relative bg-[#FAF5FF] py-24 overflow-hidden">
      <FloatingDots count={20} size="w-3 h-3" color="bg-[#6366F1]/20" />

      {/* Decorative circles */}
      <div className="absolute top-20 left-[5%] w-80 h-80 border border-[#F97316]/10 rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-[10%] w-72 h-72 border border-[#14B8A6]/10 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Top copy */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-block px-4 py-1.5 bg-white border border-[#E5E7EB] rounded-full mb-4 text-[#111827] text-sm font-medium"
          >
            How it works
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#111827]"
          >
            Get started in 3 simple steps
          </motion.h2>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              {/* Circular badge */}
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6"
                style={{ backgroundColor: step.color }}
              >
                {step.number}
              </div>

              {/* Card */}
              <div className="bg-white border-2 border-[#E5E7EB] rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow duration-300">
                <h3 className="text-xl font-semibold mb-3 text-[#111827]">
                  {step.title}
                </h3>
                <p className="text-[#111827]/70 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center"
        >
          <Button
            size="lg"
            className="bg-[#F97316] hover:bg-[#EA580C] text-white shadow-lg"
            asChild
          >
            <Link href="/login">Start FREE Trial</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}


