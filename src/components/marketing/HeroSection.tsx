"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingDots } from "./FloatingDots";

export function HeroSection() {
  return (
    <section className="relative w-full bg-gradient-to-b from-violet-100/70 to-[#FDF7FF] pt-6 pb-32 overflow-hidden">
      <FloatingDots count={20} size="w-2 h-2" color="bg-[#6366F1]/20" />

      {/* Decorative circles */}
      <div className="absolute top-20 right-[5%] w-96 h-96 border border-[#6366F1]/10 rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-[5%] w-80 h-80 border border-[#14B8A6]/10 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Header row */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-16"
        >
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#6366F1] to-[#4F46E5] rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-[#111827] font-semibold">Ornigami</span>
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button
              className="bg-[#F97316] hover:bg-[#EA580C] text-white"
              asChild
            >
              <Link href="/demo">Try the Demo</Link>
            </Button>
          </div>
        </motion.div>

        {/* Hero content */}
        <div className="text-center max-w-4xl mx-auto">
          {/* Pill badge */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6"
          >
            <span className="inline-block px-4 py-1.5 bg-white/80 border border-[#E5E7EB] rounded-full text-sm font-medium text-[#111827]">
              AI for local businesses
            </span>
          </motion.div>

          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl md:text-6xl font-extrabold mb-6 text-[#111827] leading-tight"
          >
            Stop losing customers{" "}
            <span className="text-[#F97316]">to ignored reviews</span>
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg md:text-xl text-[#111827]/70 mb-8 max-w-2xl mx-auto"
          >
            Ornigami helps you manage Google reviews with on-brand drafts, customer follow-ups, and clear profile-audit recommendations.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
          >
            <Button
              size="lg"
              className="bg-[#F97316] hover:bg-[#EA580C] text-white shadow-lg hover:shadow-xl transition-shadow"
              asChild
            >
              <Link href="/signup">Start free trial</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[#6366F1] text-[#6366F1] hover:bg-[#6366F1] hover:text-white"
              asChild
            >
              <Link href="/login">Log in</Link>
            </Button>
          </motion.div>

          {/* Trust row */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-sm text-[#111827]/60"
          >
            No setup fees. 14 day free trial. Cancel anytime.
          </motion.div>
        </div>
      </div>
    </section>
  );
}

