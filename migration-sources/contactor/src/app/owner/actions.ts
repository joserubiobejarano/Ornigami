"use server";

import { revalidatePath } from "next/cache";

import { clearOwnerDashboardSession } from "@/server/auth/session";

export async function logoutOwnerAction() {
  await clearOwnerDashboardSession();
  revalidatePath("/dashboard");
}

