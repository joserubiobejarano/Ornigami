export type BillingPeriod = "monthly" | "annual";
export type PlanId = "replies" | "booster" | "complete";
export type AgentId = "review_replies" | "review_booster";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  tagline: string;
  agents: AgentId[];
  recommended: boolean;
  seats: number;
  monthlyRequestAllowance: number;
  amounts: Record<BillingPeriod, number>;
  priceEnv: Record<BillingPeriod, string>;
  features: string[];
};

export const TRIAL_PERIOD_DAYS = 14;

export const PLANS: Record<PlanId, PlanDefinition> = {
  replies: {
    id: "replies", name: "Review Replies", tagline: "Every Google review answered, in your voice.",
    agents: ["review_replies"], recommended: false, seats: 1, monthlyRequestAllowance: 500,
    amounts: { monthly: 39, annual: 360 },
    priceEnv: { monthly: "STRIPE_PRICE_REPLIES_MONTHLY", annual: "STRIPE_PRICE_REPLIES_ANNUAL" },
    features: ["Drafted replies for every Google review", "Approve in one click, or let 4-5 star replies post automatically", "1-3 star reviews always go to you first", "Replies in your customer's own language", "Unlimited reviews synced from your profile", "1 location, 1 user"],
  },
  booster: {
    id: "booster", name: "Review Booster", tagline: "Ask every customer for a review, automatically.",
    agents: ["review_booster"], recommended: false, seats: 1, monthlyRequestAllowance: 500,
    amounts: { monthly: 39, annual: 360 },
    priceEnv: { monthly: "STRIPE_PRICE_BOOSTER_MONTHLY", annual: "STRIPE_PRICE_BOOSTER_ANNUAL" },
    features: ["Automatic review requests after every visit", "Import customers from a spreadsheet, or add them one by one", "QR code and short link for your counter", "Send window and quiet hours you control", "Up to 500 requests per month", "1 location, 1 user"],
  },
  complete: {
    id: "complete", name: "Complete", tagline: "Get the reviews, and answer every one of them.",
    agents: ["review_replies", "review_booster"], recommended: true, seats: 3, monthlyRequestAllowance: 1500,
    amounts: { monthly: 59, annual: 560 },
    priceEnv: { monthly: "STRIPE_PRICE_COMPLETE_MONTHLY", annual: "STRIPE_PRICE_COMPLETE_ANNUAL" },
    features: ["Everything in Review Replies and Review Booster", "See which requests turned into real reviews", "Alerts the moment a new review lands", "Monthly report you can forward to your team", "Up to 1,500 requests per month", "1 location, 3 users"],
  },
};

export const PLAN_ORDER: PlanId[] = ["replies", "booster", "complete"];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

export function agentsForPlan(planId: PlanId): AgentId[] {
  return PLANS[planId].agents;
}

export function planForAgent(agentId: AgentId): PlanId {
  return agentId === "review_replies" ? "replies" : "booster";
}

export function stripePriceId(planId: PlanId, period: BillingPeriod): string {
  const envName = PLANS[planId].priceEnv[period];
  const value = process.env[envName];
  if (!value) throw new Error(`Missing Stripe price env var ${envName} for plan ${planId}/${period}`);
  return value;
}

export function planIdFromStripePrice(priceId: string | null): PlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    for (const period of ["monthly", "annual"] as BillingPeriod[]) {
      if (process.env[plan.priceEnv[period]] === priceId) return plan.id;
    }
  }
  return null;
}

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatPrice(planId: PlanId, period: BillingPeriod): string {
  return EUR.format(PLANS[planId].amounts[period]);
}

export function effectiveMonthlyFromAnnual(planId: PlanId): string {
  return EUR.format(Math.round(PLANS[planId].amounts.annual / 12));
}

export function annualSavings(planId: PlanId): number {
  const plan = PLANS[planId];
  return plan.amounts.monthly * 12 - plan.amounts.annual;
}

export function annualDiscountPercent(planId: PlanId): number {
  const plan = PLANS[planId];
  return Math.round((annualSavings(planId) / (plan.amounts.monthly * 12)) * 100);
}

export function formatAnnualSavings(planId: PlanId): string {
  return `Save ${EUR.format(annualSavings(planId))}/year (${annualDiscountPercent(planId)}% off)`;
}
