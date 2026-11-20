import { cookies } from "next/headers";

import {
  BuilderStoreUnavailable,
  validateBuilderSession,
  type ActiveBuilderSession,
} from "./identity-store.ts";
import {
  readBuilderRuntimeConfig,
  type BuilderRuntimeConfig,
} from "./runtime-config.ts";

export const BUILDER_SUBJECT_HEADER = "x-builder-subject";

export type BuilderSessionLookup =
  | { status: "closed" }
  | { status: "anonymous" }
  | { status: "unavailable" }
  | {
      status: "active";
      config: BuilderRuntimeConfig;
      session: ActiveBuilderSession["session"];
      subject: ActiveBuilderSession["subject"];
    };

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function readBuilderSessionToken(
  request: Request,
  config: BuilderRuntimeConfig,
): string | null {
  return cookieValue(request.headers.get("cookie"), config.cookieName);
}

export async function lookupBuilderSessionToken(
  token: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<BuilderSessionLookup> {
  let config: BuilderRuntimeConfig;
  try {
    config = readBuilderRuntimeConfig(env);
  } catch {
    return { status: "unavailable" };
  }
  if (config.mode !== "invite" || !config.storeDir) return { status: "closed" };
  if (!token) return { status: "anonymous" };

  try {
    const active = await validateBuilderSession({
      storeDir: config.storeDir,
      token,
    });
    if (!active) return { status: "anonymous" };
    return {
      status: "active",
      config,
      session: active.session,
      subject: active.subject,
    };
  } catch (error) {
    if (error instanceof BuilderStoreUnavailable) {
      return { status: "unavailable" };
    }
    return { status: "unavailable" };
  }
}

export async function lookupBuilderSessionRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): Promise<BuilderSessionLookup> {
  let config: BuilderRuntimeConfig;
  try {
    config = readBuilderRuntimeConfig(env);
  } catch {
    return { status: "unavailable" };
  }
  if (config.mode !== "invite") return { status: "closed" };
  return lookupBuilderSessionToken(readBuilderSessionToken(request, config), env);
}

export async function lookupBuilderSessionCookie(
  env: Record<string, string | undefined> = process.env,
): Promise<BuilderSessionLookup> {
  let config: BuilderRuntimeConfig;
  try {
    config = readBuilderRuntimeConfig(env);
  } catch {
    return { status: "unavailable" };
  }
  if (config.mode !== "invite") return { status: "closed" };
  const store = await cookies();
  return lookupBuilderSessionToken(store.get(config.cookieName)?.value ?? null, env);
}

/**
 * State-changing builder endpoints require the full configured external
 * origin. See `request-origin.ts`.
 */
export function sessionCookieOptions(
  config: BuilderRuntimeConfig,
  maxAgeSeconds = config.sessionTtlSeconds,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.secureCookies,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
