import { NextResponse } from "next/server";

export function authJson(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Referrer-Policy", "no-referrer");
  return NextResponse.json(body, { ...init, headers });
}
