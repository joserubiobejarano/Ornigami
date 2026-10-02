"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import type { LoginActionState } from "@/app/login/action-state";
import {
  DashboardAuthError,
  loginOwnerDashboardUser,
} from "@/server/services/dashboard-auth.service";

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  let result: Awaited<ReturnType<typeof loginOwnerDashboardUser>>;

  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    const ipAddress = requestHeaders.get("x-real-ip") ?? forwarded ?? null;
    result = await loginOwnerDashboardUser({ email, password, ipAddress });
  } catch (error) {
    if (error instanceof DashboardAuthError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "Unable to sign in right now.",
    };
  }

  redirect(result.user.role === "internal_admin" ? "/admin" : "/dashboard");
}

