import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  createDashboardUser,
  getDashboardUserByEmail,
  getOwnerDashboardUserByBusinessId,
  markDashboardUserLastLogin,
} from "@/server/db/repositories/dashboard-users.repo";
import { businesses } from "@/server/db/schema";
import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "@/server/auth/password";
import { createOwnerDashboardSession } from "@/server/auth/session";
import {
  clearDashboardLoginFailures,
  isDashboardLoginRateLimited,
  recordDashboardLoginFailure,
} from "@/server/services/dashboard-login-rate-limit.service";

export class DashboardUserAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardUserAlreadyExistsError";
  }
}

export class DashboardAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardAuthError";
  }
}

export async function createOwnerDashboardUser(input: {
  businessId: string;
  fullName: string;
  email: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  if (!fullName) {
    throw new DashboardAuthError("Full name is required.");
  }

  if (!normalizedEmail) {
    throw new DashboardAuthError("Email is required.");
  }

  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) {
    throw new DashboardAuthError("Business not found.");
  }

  const [existingForBusiness, existingForEmail] = await Promise.all([
    getOwnerDashboardUserByBusinessId(input.businessId),
    getDashboardUserByEmail(normalizedEmail),
  ]);

  if (existingForBusiness) {
    throw new DashboardUserAlreadyExistsError(
      "This business already has an owner dashboard user.",
    );
  }

  if (existingForEmail) {
    throw new DashboardUserAlreadyExistsError("Email is already used by another dashboard user.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const created = await createDashboardUser({
    businessId: input.businessId,
    fullName,
    email: normalizedEmail,
    passwordHash,
    role: "owner",
  });

  return {
    user: created,
    temporaryPassword,
  };
}

export async function loginOwnerDashboardUser(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    throw new DashboardAuthError("Email and password are required.");
  }

  if (await isDashboardLoginRateLimited({ email, ipAddress: input.ipAddress })) {
    throw new DashboardAuthError("Invalid email or password.");
  }

  const user = await getDashboardUserByEmail(email);
  if (!user || (user.role !== "owner" && user.role !== "internal_admin")) {
    await recordDashboardLoginFailure({ email, ipAddress: input.ipAddress });
    throw new DashboardAuthError("Invalid email or password.");
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    await recordDashboardLoginFailure({ email, ipAddress: input.ipAddress });
    throw new DashboardAuthError("Invalid email or password.");
  }

  await clearDashboardLoginFailures({ email, ipAddress: input.ipAddress });

  await Promise.all([
    createOwnerDashboardSession(user.id),
    markDashboardUserLastLogin(user.id),
  ]);

  return {
    user,
  };
}
