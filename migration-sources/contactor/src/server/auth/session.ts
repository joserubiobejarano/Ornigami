import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import {
  createDashboardUserSession,
  deleteDashboardSessionByTokenHash,
  getActiveDashboardSessionByTokenHash,
} from "@/server/db/repositories/dashboard-user-sessions.repo";
import { getDashboardUserById } from "@/server/db/repositories/dashboard-users.repo";

const OWNER_SESSION_COOKIE = "stl_owner_session";
const OWNER_SESSION_DAYS = 14;

type OwnerSessionUser = {
  userId: string;
  businessId: string | null;
  role: "owner" | "internal_admin";
  fullName: string;
  email: string;
};

export async function createOwnerDashboardSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + OWNER_SESSION_DAYS * 24 * 60 * 60 * 1000);

  await createDashboardUserSession({
    userId,
    sessionTokenHash: tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(OWNER_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getOwnerDashboardSession(): Promise<OwnerSessionUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = await getActiveDashboardSessionByTokenHash(tokenHash);
  if (!session) return null;

  const user = await getDashboardUserById(session.userId);
  if (!user || (user.role !== "owner" && user.role !== "internal_admin")) return null;

  return {
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
  };
}

export async function getInternalAdminDashboardSession(): Promise<OwnerSessionUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const session = await getActiveDashboardSessionByTokenHash(hashToken(rawToken));
  if (!session) return null;

  const user = await getDashboardUserById(session.userId);
  if (!user || user.role !== "internal_admin") return null;

  return {
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
  };
}

export async function getInternalAdminDashboardSessionFromRequest(
  request: Request,
): Promise<OwnerSessionUser | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const rawToken = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${OWNER_SESSION_COOKIE}=`))
    ?.slice(OWNER_SESSION_COOKIE.length + 1);
  if (!rawToken) return null;

  const session = await getActiveDashboardSessionByTokenHash(hashToken(rawToken));
  if (!session) return null;

  const user = await getDashboardUserById(session.userId);
  if (!user || user.role !== "internal_admin") return null;

  return {
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
  };
}

export async function clearOwnerDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
  if (rawToken) {
    await deleteDashboardSessionByTokenHash(hashToken(rawToken));
  }

  cookieStore.delete(OWNER_SESSION_COOKIE);
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
