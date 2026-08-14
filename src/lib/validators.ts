import { z } from "zod";

export const EmailSchema = z.string().trim().email().max(254);
export const UuidSchema = z.string().uuid();
export const OptionalTextSchema = (max: number) => z.string().trim().max(max).optional().nullable();

export const ProfileSchema = z.object({
  full_name: z.string().min(1, "Required").max(120),
  business_name: z.string().min(1, "Required").max(200),
  city: z.string().min(1, "Required").max(120),
  country: z.string().min(1, "Required").max(120),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

const DbTimestampSchema = z.union([z.string(), z.date()]).transform((value) =>
  value instanceof Date ? value.toISOString() : value
);

export const DbBusinessRowSchema = z.object({
  id: z.string(),
  owner_user_id: z.string(),
  name: z.string(),
  business_type: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  google_review_url: z.string().nullable(),
  rebooking_url: z.string().nullable(),
  tone: z.string().nullable(),
  language: z.string().nullable(),
  email_from_name: z.string().nullable(),
  created_at: DbTimestampSchema,
  updated_at: DbTimestampSchema,
});

export const DbBusinessAgentRowSchema = z.object({
  id: z.string(),
  business_id: z.string(),
  agent_id: z.string(),
  status: z.string(),
  plan_id: z.string().nullable().optional(),
  billing_period: z.string().nullable().optional(),
  current_period_start: DbTimestampSchema.nullable().optional(),
  current_period_end: DbTimestampSchema.nullable().optional(),
  activated_at: DbTimestampSchema.nullable(),
  deactivated_at: DbTimestampSchema.nullable(),
  created_at: DbTimestampSchema,
  updated_at: DbTimestampSchema,
});

export const UserPlanViewRowSchema = z.object({
  plan_status: z.string().nullable().optional(),
  subscription_status: z.string().nullable().optional(),
  plan_type: z.string().nullable().optional(),
  manual_plan: z.string().nullable().optional(),
  plan_current_period_end: DbTimestampSchema.nullable().optional(),
  subscription_current_period_end: DbTimestampSchema.nullable().optional(),
  ai_posts_used: z.coerce.number().nullable().optional(),
  audits_used: z.coerce.number().nullable().optional(),
  usage_reset_date: DbTimestampSchema.nullable().optional(),
});

export const ProfileUsageRowSchema = z.object({
  ai_posts_used: z.coerce.number().nullable(),
  audits_used: z.coerce.number().nullable(),
  usage_reset_date: DbTimestampSchema.nullable(),
});

export const UserBillingMappingSchema = z.object({
  user_id: z.string(),
});

export const IdRowSchema = z.object({
  id: z.string(),
});
