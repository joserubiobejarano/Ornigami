export type BusinessAgentStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "inactive";

export function toBusinessAgentStatus(stripeStatus: string): BusinessAgentStatus {
  if (stripeStatus === "active" || stripeStatus === "trialing") return stripeStatus;
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "unpaid") return "unpaid";
  if (stripeStatus === "canceled") return "canceled";
  return "inactive";
}

export function paymentFailureStatus(stripeStatus: string): "past_due" | "unpaid" | "canceled" {
  if (stripeStatus === "unpaid" || stripeStatus === "canceled") return stripeStatus;
  return "past_due";
}
