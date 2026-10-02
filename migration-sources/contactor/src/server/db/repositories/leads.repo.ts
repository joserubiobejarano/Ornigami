import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { leads, type Lead } from "@/server/db/schema";
import { normalizePhone } from "@/server/lib/phone";

type LeadSource = "hosted_form" | "embed_form" | "sms" | "whatsapp" | "manual";
type LeadStatus = "new" | "qualified" | "contacted" | "closed";

type CreateLeadInput = {
  businessId: string;
  source: LeadSource;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: LeadStatus;
  intent?: string | null;
  urgency?: string | null;
  summary?: string | null;
  notes?: string | null;
};

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const [created] = await db
    .insert(leads)
    .values({
      businessId: input.businessId,
      source: input.source,
      fullName: input.fullName ?? null,
      email: input.email ?? null,
      phone: normalizePhone(input.phone),
      status: input.status ?? "new",
      intent: input.intent ?? null,
      urgency: input.urgency ?? null,
      summary: input.summary ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return created;
}

export async function findLeadByPhone(
  businessId: string,
  phone: string,
): Promise<Lead | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const [existing] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.businessId, businessId), eq(leads.phone, normalized)))
    .limit(1);

  return existing ?? null;
}

export async function getLeadById(leadId: string): Promise<Lead | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  return lead ?? null;
}

export async function listLatestLeads(limit = 20): Promise<Lead[]> {
  return db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit);
}

type UpdateLeadInput = {
  fullName?: string | null;
  intent?: string | null;
  urgency?: string | null;
  email?: string | null;
  status?: LeadStatus;
  summary?: string | null;
};

export async function updateLeadById(
  leadId: string,
  input: UpdateLeadInput,
): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (input.fullName !== undefined) updates.fullName = input.fullName ?? null;
  if (input.intent !== undefined) updates.intent = input.intent ?? null;
  if (input.urgency !== undefined) updates.urgency = input.urgency ?? null;
  if (input.email !== undefined) updates.email = input.email?.toLowerCase() ?? null;
  if (input.status !== undefined) updates.status = input.status;
  if (input.summary !== undefined) updates.summary = input.summary ?? null;

  if (Object.keys(updates).length === 0) {
    return;
  }

  await db
    .update(leads)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
}
