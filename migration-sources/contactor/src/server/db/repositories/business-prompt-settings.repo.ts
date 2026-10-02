import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  businessPromptSettings,
  type BusinessPromptSetting,
} from "@/server/db/schema";

export async function getBusinessPromptSettingsByBusinessId(
  businessId: string,
): Promise<BusinessPromptSetting | null> {
  const [result] = await db
    .select()
    .from(businessPromptSettings)
    .where(eq(businessPromptSettings.businessId, businessId))
    .limit(1);

  return result ?? null;
}
