"use client";

import { motion } from "motion/react";
import {
  UtensilsCrossed,
  Stethoscope,
  Scissors,
  Dumbbell,
  Wrench,
  ShoppingBag,
} from "lucide-react";
import { FloatingDots } from "./FloatingDots";

const businessTypes = [
  { icon: UtensilsCrossed, label: "Restaurants" },
  { icon: Stethoscope, label: "Clinics" },
  { icon: Scissors, label: "Salons" },
  { icon: Dumbbell, label: "Gyms" },
  { icon: Wrench, label: "Local services" },
  { icon: ShoppingBag, label: "Retail stores" },
];

export function WhoItsForSection() {
  return (
    <section className="relative bg-white py-24 overflow-hidden">
      <FloatingDots count={18} size="w-2.5 h-2.5" color="bg-[#6366F1]/15" />

      {/* Decorative circle */}
      <div className="absolute top-20 right-[10%] w-72 h-72 border border-[#14B8A6]/10 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Top copy */}
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-[#111827]"
          >
            Who it is for
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-[#111827]/70 max-w-2xl mx-auto"
          >
            If customers find you on Google Maps, Ornigami can help you.
          </motion.p>
        </div>

        {/* Business types grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {businessTypes.map((business, index) => {
            const Icon = business.icon;
            return (
              <motion.div
                key={business.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                whileHover={{ scale: 1.05, y: -4 }}
                className="bg-white border-2 border-[#E5E7EB] rounded-xl p-6 text-center hover:border-[#6366F1]/40 hover:shadow-xl hover:shadow-[#6366F1]/10 transition-all duration-300 cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-br from-[#6366F1]/10 to-[#14B8A6]/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-[#6366F1]" />
                </div>
                <p className="text-sm font-medium text-[#111827]">
                  {business.label}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

