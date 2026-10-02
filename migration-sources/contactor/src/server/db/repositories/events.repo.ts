import { db } from "@/server/db/client";
import { leadEvents, type LeadEvent } from "@/server/db/schema";

type CreateLeadEventInput = {
  businessId: string;
  leadId: string;
  eventType: string;
  payload?: Record<string, unknown>;
};

export async function createLeadEvent(input: CreateLeadEventInput): Promise<LeadEvent> {
  const [created] = await db
    .insert(leadEvents)
    .values({
      businessId: input.businessId,
      leadId: input.leadId,
      eventType: input.eventType,
      payload: input.payload,
    })
    .returning();

  return created;
}
