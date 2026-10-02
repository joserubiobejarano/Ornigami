import { db } from "@/server/db/client";
import { formSubmissions, type FormSubmission } from "@/server/db/schema";

type CreateFormSubmissionInput = {
  businessId: string;
  leadId?: string | null;
  sourceLabel?: string | null;
  payload: Record<string, unknown>;
};

export async function createFormSubmission(
  input: CreateFormSubmissionInput,
): Promise<FormSubmission> {
  const [created] = await db
    .insert(formSubmissions)
    .values({
      businessId: input.businessId,
      leadId: input.leadId ?? null,
      sourceLabel: input.sourceLabel ?? null,
      payload: input.payload,
    })
    .returning();

  return created;
}
