import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { businesses, type Business } from "@/server/db/schema";
import { normalizePhone, withWhatsappPrefix } from "@/server/lib/phone";

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const [result] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1);

  return result ?? null;
}

export async function getBusinessById(businessId: string): Promise<Business | null> {
  const [result] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return result ?? null;
}

export async function getBusinessByInboundAddress(
  address: string,
): Promise<Business | null> {
  const result = await resolveBusinessByInboundAddress(address);
  return result.business;
}

export async function resolveBusinessByInboundAddress(address: string): Promise<{
  business: Business | null;
  normalizedInboundAddress: string | null;
  matchedBusinessAddress: string | null;
}> {
  const normalized = normalizePhone(address);
  if (!normalized) {
    return {
      business: null,
      normalizedInboundAddress: null,
      matchedBusinessAddress: null,
    };
  }

  const smsAddress = normalized.replace(/^whatsapp:/, "");
  const allowedAddresses = new Set([smsAddress, withWhatsappPrefix(smsAddress)]);

  const candidates = await db
    .select()
    .from(businesses)
    .where(isNotNull(businesses.twilioPhoneNumber));

  for (const business of candidates) {
    const normalizedBusinessAddress = normalizePhone(business.twilioPhoneNumber);
    if (!normalizedBusinessAddress) continue;
    if (allowedAddresses.has(normalizedBusinessAddress)) {
      return {
        business,
        normalizedInboundAddress: normalized,
        matchedBusinessAddress: normalizedBusinessAddress,
      };
    }
  }

  return {
    business: null,
    normalizedInboundAddress: normalized,
    matchedBusinessAddress: null,
  };
}

export async function listBusinesses(limit = 50): Promise<Business[]> {
  return db.select().from(businesses).limit(limit);
}

export async function deleteBusinessById(businessId: string): Promise<void> {
  await db.delete(businesses).where(eq(businesses.id, businessId));
}
