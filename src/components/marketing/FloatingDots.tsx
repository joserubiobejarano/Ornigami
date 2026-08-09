"use client";

import { motion } from "motion/react";

interface FloatingDotsProps {
  count?: number;
  size?: string;
  color?: string;
  className?: string;
}

export function FloatingDots({
  count = 20,
  size = "w-2 h-2",
  color = "bg-[#6366F1]/20",
  className = "",
}: FloatingDotsProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        // Keep the layout stable across renders while preserving visual variation per dot.
        const seed = i + 1;
        const duration = 4 + ((seed * 37) % 100) / 100 * 3; // 4-7 seconds
        const delay = ((seed * 17) % 100) / 100 * 2;
        const x = (seed * 47) % 100; // 0-100%
        const y = (seed * 73) % 100; // 0-100%
        const xOffset = (((seed * 29) % 100) / 100 - 0.5) * 40; // -20px to 20px
        const yOffset = (((seed * 61) % 100) / 100 - 0.5) * 40; // -20px to 20px
        return (
          <motion.div
            key={i}
            className={`absolute ${size} ${color} rounded-full ${className}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0.8, 1],
              scale: [0, 1, 0.9, 1],
              x: [0, xOffset, -xOffset, 0],
              y: [0, yOffset, -yOffset, 0],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </>
  );
}

