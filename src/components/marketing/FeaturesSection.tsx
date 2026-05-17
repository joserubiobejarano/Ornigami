"use client";

import { motion } from "motion/react";
import { MessageSquare, FileText, CheckCircle } from "lucide-react";
import { FloatingDots } from "./FloatingDots";

const features = [
  {
    icon: MessageSquare,
    title: "Review autopilot",
    description:
      "Automatic, on-brand replies to every Google review , without lifting a finger.",
    color: "#6366F1",
  },
  {
    icon: FileText,
    title: "Local SEO content",
    description:
      "AI-generated blog posts and Google Business Profile updates tailored to your city, niche, and customers.",
    color: "#14B8A6",
  },
  {
    icon: CheckCircle,
    title: "Profile audits",
    description:
      "Instant recommendations to improve your Google Business Profile name, description, photos, categories, and more.",
    color: "#6366F1",
  },
];

export function FeaturesSection() {
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
            Running a local business is hard.{" "}
            <span className="text-[#F97316]">
              Managing your online presence shouldn&apos;t be.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-[#111827]/70 max-w-2xl mx-auto"
          >
            That&apos;s where we come in.
          </motion.p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white border-2 border-[#E5E7EB] rounded-2xl p-8 h-full hover:border-[#6366F1]/50 hover:shadow-2xl transition-all duration-300 group"
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${feature.color}15` }}
                >
                  <Icon
                    className="w-7 h-7"
                    style={{ color: feature.color }}
                  />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-[#111827]">
                  {feature.title}
                </h3>
                <p className="text-[#111827]/70 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


