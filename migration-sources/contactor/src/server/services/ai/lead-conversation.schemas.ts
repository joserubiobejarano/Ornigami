import { z } from "zod";

export const leadStatusSchema = z.enum(["new", "qualified", "contacted", "closed"]);
export const leadUpdatesSchema = z.object({
  full_name: z.string().min(1).nullable(),
  intent: z.string().min(1).nullable(),
  urgency: z.string().min(1).nullable(),
  email: z.string().email().nullable(),
  status: leadStatusSchema.nullable(),
  summary: z.string().min(1).nullable(),
});

export const leadReplyResultSchema = z.object({
  reply_text: z.string().min(1),
  lead_updates: leadUpdatesSchema,
  ai_state_updates: z.record(z.string(), z.unknown()),
  should_notify_business: z.boolean(),
  should_escalate: z.boolean(),
});

export type LeadReplyResult = z.infer<typeof leadReplyResultSchema>;
