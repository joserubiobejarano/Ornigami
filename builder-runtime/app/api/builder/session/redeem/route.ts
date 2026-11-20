import { NextResponse } from "next/server";

import {
  BuilderInviteRedemptionError,
  BuilderStoreUnavailable,
  redeemBuilderInvite,
} from "@builder/lib/identity-store";
import { isSameOriginRequest, sessionCookieOptions } from "@builder/lib/session";
import { readBuilderRuntimeConfig } from "@builder/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: string, status: number): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
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
  if (!isSameOriginRequest(request)) {
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure("invite", 400);
  }
  const token = form.get("token");
  if (typeof token !== "string" || !token.trim()) {
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
