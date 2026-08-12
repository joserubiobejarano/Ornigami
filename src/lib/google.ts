import { getSql } from "@/lib/db/neon";
import { updateGbpTokens } from "@/lib/db/gbp";
import { getServerAppUrl } from "@/lib/env";
import { decryptToken } from "@/lib/encrypted-token";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_API_BASE = "https://businessprofile.googleapis.com/v1";

/** Must match the URI registered in Google Cloud Console (Authorized redirect URIs). */
export function getGoogleGbpOAuthRedirectUri(): string {
  return `${getServerAppUrl()}/api/google/oauth/callback`;
}

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getGoogleGbpOAuthRedirectUri(),
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    scope: "https://www.googleapis.com/auth/business.manage",
    state,
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: getGoogleGbpOAuthRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  }>;
}

export async function refreshAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    refresh_token,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Refresh token failed: ${res.status}`);

  return res.json() as Promise<{ access_token: string; expires_in: number; token_type: string; scope?: string }>;
}

export async function gbpFetch(path: string, accessToken: string) {
  const res = await fetch(`${GBP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GBP fetch ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Token management helpers
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO
  scope?: string | null;
};

export async function getUserGoogleTokens(userId: string): Promise<Tokens | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT access_token, refresh_token, expires_at, scope
    FROM public.gbp_connections
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  const data = rows[0] as Tokens | undefined;
  if (!data) return null;
  const access = decryptToken(data.access_token);
  const refresh = decryptToken(data.refresh_token);
  const result = { ...data, access_token: access.value, refresh_token: refresh.value };
  if (access.legacy || refresh.legacy) {
    await updateGbpTokens({
      userId,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: result.expires_at,
      scope: result.scope ?? null,
    });
  }
  return result;
}

function isExpired(expires_at: string, skewSec = 120): boolean {
  return Date.now() + skewSec * 1000 >= new Date(expires_at).getTime();
}

export async function refreshIfNeeded(userId: string, tokens: Tokens): Promise<Tokens> {
  if (!isExpired(tokens.expires_at)) return tokens;

  const params = new URLSearchParams();
  params.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  params.set("client_secret", process.env.GOOGLE_CLIENT_SECRET!);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", tokens.refresh_token);

  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!r.ok) throw new Error(`Google refresh failed: ${await r.text()}`);

  const json = await r.json();

  const newTokens: Tokens = {
    access_token: json.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    scope: json.scope ?? tokens.scope ?? null,
  };

  await updateGbpTokens({
    userId,
    accessToken: newTokens.access_token,
    refreshToken: newTokens.refresh_token,
    expiresAt: newTokens.expires_at,
    scope: newTokens.scope ?? null,
  });

  return newTokens;
}

export async function googleFetch(
  userId: string,
  url: string,
  opts?: RequestInit
): Promise<Response> {
  let tokens = await getUserGoogleTokens(userId);
  if (!tokens) throw new Error("No Google connection found.");

  tokens = await refreshIfNeeded(userId, tokens);

  const headers = new Headers(opts?.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);

  return fetch(url, { ...opts, headers });
}
