export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { exchangeCodeForTokens } from "@/lib/google";
import { upsertGbpConnection } from "@/lib/db/gbp";
import { sql } from "@/lib/db/neon";
import { getServerAppUrl } from "@/lib/env";
import { parseGoogleOAuthState } from "@/lib/google-oauth-state";
import { resolveUser } from "@/lib/user-from-req";
import { assertGoogleBusinessOwner, requireGoogleBusinessContext, requireGoogleWorkflowEntitlement } from "@/lib/google-business";
import { safeLogger } from "@/lib/safe-logger";
import { decryptToken, encryptToken } from "@/lib/encrypted-token";
import type { BusinessContext } from "@/lib/business-context";

function redirectWithGoogleError(reason: string) {
  const response = NextResponse.redirect(
    new URL(`/dashboard/agents/review-replies/google-connection?google=error&reason=${reason}`, getServerAppUrl()),
    { status: 302 }
  );
  response.cookies.set("ll_gbp_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWithGoogleError("connection_failed");

  const cookieState = req.headers.get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("ll_gbp_oauth_state="))
    ?.slice("ll_gbp_oauth_state=".length);
  let normalizedCookieState = "";
  try {
    normalizedCookieState = cookieState ? decodeURIComponent(cookieState) : "";
  } catch {
    return redirectWithGoogleError("connection_failed");
  }

  if (!normalizedCookieState || normalizedCookieState !== state) {
    return redirectWithGoogleError("connection_failed");
  }

  const parsedState = parseGoogleOAuthState(state);
  if (!parsedState.valid || !parsedState.userId || !parsedState.businessId || !parsedState.ownerUserId) {
    return redirectWithGoogleError("connection_failed");
  }

  const user = await resolveUser(req);
  if (!user || user.demo || user.id !== parsedState.userId) {
    return redirectWithGoogleError("connection_failed");
  }

  // Revalidate actor access, owner role, and the owner's current identity before contacting Google.
  let context: BusinessContext;
  try {
    context = await requireGoogleBusinessContext(user.id, parsedState.businessId);
    assertGoogleBusinessOwner(context);
    if (context.integrationOwnerUserId !== parsedState.ownerUserId) {
      return redirectWithGoogleError("connection_failed");
    }
    await requireGoogleWorkflowEntitlement(context);
  } catch {
    return redirectWithGoogleError("connection_failed");
  }

  const operationRows = await sql`SELECT * FROM public.begin_account_lifecycle_operation(
    ${parsedState.ownerUserId}::uuid,${user.id}::uuid,${parsedState.businessId}::uuid,
    'google_oauth_exchange',${createHash("sha256").update(`${state}\u0000${code}`).digest("hex")},30000)`;
  const lifecycleOperation = operationRows[0] as { result?: string; token?: string } | undefined;
  if (lifecycleOperation?.result !== "claimed" || !lifecycleOperation.token) {
    return redirectWithGoogleError("connection_failed");
  }
  const operationToken = lifecycleOperation.token;
  let tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (error) {
    const knownRefreshToken = error && typeof error === "object" && "knownRefreshToken" in error
      && typeof (error as { knownRefreshToken?: unknown }).knownRefreshToken === "string"
      ? (error as { knownRefreshToken: string }).knownRefreshToken : null;
    const knownAccessToken = error && typeof error === "object" && "knownAccessToken" in error
      && typeof (error as { knownAccessToken?: unknown }).knownAccessToken === "string"
      ? (error as { knownAccessToken: string }).knownAccessToken : null;
    const evidenceToken = knownRefreshToken ?? knownAccessToken;
    if (evidenceToken) {
      await sql`UPDATE public.account_lifecycle_operations SET encrypted_provider_evidence=${encryptToken(evidenceToken)},updated_at=now()
        WHERE token=${operationToken}::uuid AND status IN ('active','uncertain')`;
      let compensated = false;
      try {
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: evidenceToken }), signal: AbortSignal.timeout(10_000),
        });
        compensated = response.status === 200;
      } catch { /* Durable encrypted evidence remains pending for reconciliation. */ }
      await sql`SELECT public.finish_account_lifecycle_operation(${operationToken}::uuid,${compensated ? "failed" : "uncertain"})`;
    } else {
      await sql`SELECT public.finish_account_lifecycle_operation(${operationToken}::uuid,'uncertain')`;
    }
    return redirectWithGoogleError("connection_failed");
  }

  const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token.trim() : "";
  if (!refreshToken || typeof tokens.access_token !== "string" || !tokens.access_token) {
    await sql`SELECT public.finish_account_lifecycle_operation(${operationToken}::uuid,'uncertain')`;
    return redirectWithGoogleError("missing_refresh_token");
  }
  let persistedSnapshot: { connectionVersion: string; encryptedRefreshToken: string } | null = null;
  try {
    const latestContext = await requireGoogleBusinessContext(user.id, parsedState.businessId);
    assertGoogleBusinessOwner(latestContext);
    if (latestContext.integrationOwnerUserId !== parsedState.ownerUserId) throw new Error("google_oauth_owner_changed");
    await requireGoogleWorkflowEntitlement(latestContext);
    // Reconnect cache invalidation and credential replacement share one
    // business→user locked SQL statement. The returned ciphertext is the
    // exact randomized encryption persisted by PostgreSQL's upsert.
    persistedSnapshot = await upsertGbpConnection({
      userId: parsedState.ownerUserId,
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
    });
    if (!persistedSnapshot.connectionVersion || !persistedSnapshot.encryptedRefreshToken) throw new Error("google_oauth_connection_not_persisted");
    const finished = await sql`SELECT public.finish_account_lifecycle_operation(${operationToken}::uuid,'done') AS changed`;
    if ((finished[0] as { changed?: boolean } | undefined)?.changed !== true) throw new Error("google_oauth_operation_lease_lost");
  } catch (error: unknown) {
    // The code exchange returned a fresh credential, but freeze may have won
    // before local persistence. Keep encrypted evidence until compensation is
    // acknowledged; unknown outcomes remain lifecycle-blocking.
    let savedSnapshot = persistedSnapshot;
    let lookupCertain = false;
    if (!savedSnapshot) {
      try {
        const savedRows = await sql`SELECT connection_version,refresh_token FROM public.gbp_connections
          WHERE user_id=${parsedState.ownerUserId}::uuid LIMIT 1`;
        const row = savedRows[0] as { connection_version?: string; refresh_token?: string } | undefined;
        lookupCertain = true;
        if (row?.connection_version && row.refresh_token && decryptToken(row.refresh_token).value === refreshToken) {
          savedSnapshot = { connectionVersion: row.connection_version, encryptedRefreshToken: row.refresh_token };
        }
      } catch { /* A lost write response with unreadable state remains uncertain. */ }
    }
    const evidenceCiphertext = savedSnapshot?.encryptedRefreshToken ?? encryptToken(refreshToken);
    await sql`UPDATE public.account_lifecycle_operations
      SET encrypted_provider_evidence=${evidenceCiphertext},updated_at=now()
      WHERE token=${operationToken}::uuid AND status IN ('active','uncertain')`;
    let compensated = false;
    try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }), signal: AbortSignal.timeout(10_000),
      });
      compensated = response.status === 200;
    } catch { /* Keep uncertain evidence for operator reconciliation. */ }
    let durableProof = lookupCertain && !savedSnapshot;
    if (compensated && savedSnapshot) {
      try {
        await sql`INSERT INTO public.privacy_google_revocation_evidence
          (operation_id,user_id,connection_version,encrypted_refresh_token,encrypted_revoked_token,acknowledged_at)
          VALUES (${operationToken}::uuid,${parsedState.ownerUserId}::uuid,${savedSnapshot.connectionVersion}::uuid,
            ${savedSnapshot.encryptedRefreshToken},${encryptToken(refreshToken)},now()) ON CONFLICT (operation_id) DO NOTHING`;
        const proof = await sql`SELECT connection_version,encrypted_refresh_token FROM public.privacy_google_revocation_evidence
          WHERE operation_id=${operationToken}::uuid AND user_id=${parsedState.ownerUserId}::uuid`;
        const row = proof[0] as { connection_version?: string; encrypted_refresh_token?: string } | undefined;
        durableProof = row?.connection_version === savedSnapshot.connectionVersion
          && row.encrypted_refresh_token === savedSnapshot.encryptedRefreshToken;
      } catch { durableProof = false; }
    }
    await sql`SELECT public.finish_account_lifecycle_operation(${operationToken}::uuid,${compensated && durableProof ? "failed" : "uncertain"})`;
    safeLogger.error("google.oauth.callback.save_failed", { error: error instanceof Error ? error.message : "unknown" });
    return redirectWithGoogleError("connection_failed");
  }

  const response = NextResponse.redirect(new URL("/dashboard", getServerAppUrl()), { status: 302 });
  response.cookies.set("ll_gbp_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}
