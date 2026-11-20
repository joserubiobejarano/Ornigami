import { NextResponse } from "next/server";

import {
  BuilderInviteRedemptionError,
  BuilderStoreUnavailable,
  redeemBuilderInvite,
} from "@builder/lib/identity-store";
import {
  BUILDER_REDEEM_MAX_BODY_BYTES,
  readBoundedUrlEncodedForm,
} from "@builder/lib/bounded-form";
import {
  consumeRedemptionAttempt,
  redemptionClientKey,
} from "@builder/lib/redemption-limiter";
import { isSameOriginRequest } from "@builder/lib/request-origin";
import { sessionCookieOptions } from "@builder/lib/session";
import { readBuilderRuntimeConfig } from "@builder/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(
  error: string,
  status: number,
  extraHeaders: HeadersInit = {},
): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        ...extraHeaders,
      },
    },
  );
}

export async function POST(request: Request) {
  let config;
  try {
    config = readBuilderRuntimeConfig();
  } catch {
    return failure("unavailable", 503);
  }
  if (config.mode !== "invite" || !config.storeDir) {
    return failure("invite", 404);
  }
  if (!isSameOriginRequest(request, config)) {
    return new NextResponse(null, {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const attempt = consumeRedemptionAttempt({
    clientKey: redemptionClientKey(request, config.trustProxyHeaders),
    windowSeconds: config.redeemWindowSeconds,
    clientLimit: config.redeemClientAttemptLimit,
    globalLimit: config.redeemGlobalAttemptLimit,
  });
  if (!attempt.ok) {
    return failure("rate_limited", 429, {
      "Retry-After": String(attempt.retryAfterSeconds),
    });
  }

  const bounded = await readBoundedUrlEncodedForm(
    request,
    BUILDER_REDEEM_MAX_BODY_BYTES,
  );
  if (!bounded.ok) {
    return failure(bounded.error, bounded.status);
  }

  const tokens = bounded.params.getAll("token");
  if (tokens.length !== 1) {
    return failure("invite", 400);
  }
  const token = tokens[0].trim();
  if (
    !token ||
    token.length > 512 ||
    [...bounded.params.keys()].some((key) => key !== "token")
  ) {
    return failure("invite", 400);
  }

  try {
    const redeemed = await redeemBuilderInvite({
      storeDir: config.storeDir,
      token,
      sessionTtlSeconds: config.sessionTtlSeconds,
    });
    const response = NextResponse.json(
      { ok: true, subjectId: redeemed.subject.id },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
          "X-Builder-Subject": redeemed.subject.id,
        },
      },
    );
    response.cookies.set(
      config.cookieName,
      redeemed.token,
      sessionCookieOptions(config),
    );
    return response;
  } catch (error) {
    if (error instanceof BuilderInviteRedemptionError) {
      return failure("invite", 400);
    }
    if (error instanceof BuilderStoreUnavailable) {
      return failure("unavailable", 503);
    }
    return failure("unavailable", 503);
  }
}
