import { createLeadEvent } from "@/server/db/repositories/events.repo";

type LogEventInput = {
  businessId: string;
  leadId: string;
  eventType: string;
  payload?: Record<string, unknown>;
};

export async function logEvent(input: LogEventInput): Promise<void> {
  await createLeadEvent(input);
}
