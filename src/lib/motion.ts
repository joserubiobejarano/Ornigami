export const reveal = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export const revealLeft = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0 },
};

export const revealRight = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0 },
};

export const revealTransition = { duration: 0.45, ease: "easeOut" as const };
export const stagger = { visible: { transition: { staggerChildren: 0.07 } } };
