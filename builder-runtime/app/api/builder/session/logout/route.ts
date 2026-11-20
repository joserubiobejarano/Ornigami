import { NextResponse } from "next/server";

import { revokeBuilderSession } from "@builder/lib/identity-store";
import {
  isSameOriginRequest,
  readBuilderSessionToken,
  sessionCookieOptions,
} from "@builder/lib/session";
import { readBuilderRuntimeConfig } from "@builder/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let config;
  try {
    config = readBuilderRuntimeConfig();
  } catch {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  if (config.mode !== "invite" || !config.storeDir) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  if (!isSameOriginRequest(request)) {
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const token = readBuilderSessionToken(request, config);
  if (token) {
    try {
      await revokeBuilderSession({
        storeDir: config.storeDir,
        token,
      });
    } catch {
      // The cookie is still cleared. The session record remains for operator
      // inspection and cannot be used from this browser.
    }
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(config.cookieName, "", {
    ...sessionCookieOptions(config, 0),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
