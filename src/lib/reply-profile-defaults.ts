import { sql } from "@/lib/db/neon";
import { resolveBusinessContext } from "@/lib/business-context";

export type ProfileReplyRow = {
  business_name: string | null;
  reply_tone: string | null;
  owner_name: string | null;
  contact_preference: string | null;
  /** When true, generated replies should post to GBP (when plan allows); otherwise save as drafts. */
  auto_reply_all_reviews: boolean;
};

/** Load saved review-reply defaults from profiles. Returns null if the row is missing. */
export async function getProfileReplyDefaults(
  userId: string
): Promise<ProfileReplyRow | null> {
  const rows = await sql`
    SELECT
      business_name,
      reply_tone,
      owner_name,
      contact_preference,
      COALESCE(auto_reply_all_reviews, false) AS auto_reply_all_reviews
    FROM public.profiles
    WHERE id = ${userId}
    LIMIT 1
  `;

  const data = rows[0] as ProfileReplyRow | undefined;
  if (!data) return null;
  return data;
}


/** Resolve shared reply policy through the selected business's canonical owner profile. */
export async function getBusinessReplyDefaults(
  actorUserId: string,
  businessId: string
): Promise<ProfileReplyRow | null> {
  const context = await resolveBusinessContext(actorUserId, businessId);
  if (!context) return null;
  return getProfileReplyDefaults(context.replyPolicyOwnerUserId);
}
