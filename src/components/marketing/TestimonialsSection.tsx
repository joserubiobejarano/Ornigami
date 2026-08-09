"use client";

import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FloatingDots } from "./FloatingDots";
import { Button } from "@/components/ui/button";

const testimonials = [
  {
    business: "Illustrative workflow",
    quote: "Verified customer stories will appear here after launch. Explore the live demo to see the product workflow.",
    person: "Example only",
    role: "Not a customer testimonial",
    bgColor: "bg-orange-50",
  },
];

export function TestimonialsSection() {
  return (
    <section className="relative bg-[#FAF5FF] py-24 overflow-hidden">
      <FloatingDots count={18} size="w-2.5 h-2.5" color="bg-[#6366F1]/15" />

      {/* Decorative circle */}
      <div className="absolute top-20 left-[10%] w-72 h-72 border border-[#F97316]/10 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Top copy */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-block px-4 py-1.5 bg-white border border-[#E5E7EB] rounded-full mb-4 text-[#111827] text-sm font-medium"
          >
            Testimonials
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#111827]"
          >
            What local businesses say
          </motion.h2>
        </div>

        {/* Arrow buttons (visual only for now) */}
        <div className="flex justify-end gap-2 mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="text-[#111827]/60 hover:text-[#111827]"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#111827]/60 hover:text-[#111827]"
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.business}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`${testimonial.bgColor} rounded-2xl p-8 border-2 border-transparent hover:border-[#6366F1]/30 transition-all`}
            >
              {/* Business name */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-[#111827]">
                  {testimonial.business}
                </h3>
              </div>

              {/* Quote */}
              <p className="text-[#111827]/80 leading-relaxed mb-6">
                {testimonial.quote}
              </p>

              {/* Person info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#6366F1]/20 flex items-center justify-center">
                  <span className="text-[#6366F1] font-semibold text-sm">
                    {testimonial.person
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#111827]">
                    {testimonial.person}
                  </p>
                  <p className="text-xs text-[#111827]/60">
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

