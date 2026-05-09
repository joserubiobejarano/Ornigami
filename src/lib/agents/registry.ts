export type AgentStatus = "active" | "coming_soon";

export type AgentRegistryItem = {
  id: "review_replies" | "review_booster" | "speed_to_lead";
  slug: "review-replies" | "review-booster" | "speed-to-lead";
  name: string;
  shortDescription: string;
  status: AgentStatus;
  basePath: string;
};

export const AGENT_REGISTRY: AgentRegistryItem[] = [
  {
    id: "review_replies",
    slug: "review-replies",
    name: "Review Replies",
    shortDescription: "Handle and respond to your Google reviews.",
    status: "active",
    basePath: "/dashboard/agents/review-replies",
  },
  {
    id: "review_booster",
    slug: "review-booster",
    name: "Review Booster",
    shortDescription: "Post-visit review request automations.",
    status: "coming_soon",
    basePath: "/dashboard/agents/review-booster",
  },
  {
    id: "speed_to_lead",
    slug: "speed-to-lead",
    name: "Speed to Lead",
    shortDescription: "Lead response and qualification workflows.",
    status: "coming_soon",
    basePath: "/dashboard/agents/speed-to-lead",
  },
];
