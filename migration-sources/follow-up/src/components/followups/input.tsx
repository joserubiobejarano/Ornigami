import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const CONTROL_CLASSES = "h-11 w-full rounded-xl border-[1.5px] border-input bg-card px-3.5 py-2 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

export const inputClassName = CONTROL_CLASSES;

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL_CLASSES} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL_CLASSES} ${props.className ?? ""}`} />;
}
