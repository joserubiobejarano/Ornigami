import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "accent" | "secondary" | "outline";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  accent: "bg-accent-coral text-primary hover:brightness-95",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border-[1.5px] border-border bg-card text-primary hover:bg-surface",
};

export function buttonStyles(variant: ButtonVariant = "primary") {
  return `inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 ${VARIANT_CLASSES[variant]}`;
}

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${buttonStyles(variant)} ${className}`} {...props} />;
}
