export function normalizePlanIdValue(value: unknown): "free" | "replies" | "booster" | "complete" {
  if (value === "replies" || value === "booster" || value === "complete") return value;
  return "free";
}
