import { NextResponse } from "next/server";

import { revokeBuilderSession } from "@builder/lib/identity-store";
import {
  readBuilderSessionToken,
  sessionCookieOptions,
} from "@builder/lib/session";
import { isSameOriginRequest } from "@builder/lib/request-origin";
import { readBuilderRuntimeConfig } from "@builder/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "logout_unconfirmed",
      retryable: true,
      message:
        "Sign out could not be confirmed. Your session is still active; try again.",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "1",
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
    return unavailable();
  }
  if (config.mode !== "invite" || !config.storeDir) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
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

  const token = readBuilderSessionToken(request, config);
  let revoked = false;
  if (token) {
    try {
      revoked = await revokeBuilderSession({
        storeDir: config.storeDir,
        token,
      });
    } catch {
      // Do not clear the cookie: the server-side session may still be active.
      return unavailable();
    }
  }

  const response = NextResponse.json(
    {
      ok: true,
      state: revoked ? "revoked" : "already_inactive",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
  response.cookies.set(config.cookieName, "", {
    ...sessionCookieOptions(config, 0),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
