import { handlers } from "@/auth";

const SESSION_PATH = "/api/auth/session";

function isSessionRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === SESSION_PATH || pathname === `${SESSION_PATH}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponseLike(response: Response, value: unknown): Response {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  return new Response(JSON.stringify(value), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Auth.js needs the deletion subject in its trusted server-side session so the
 * recovery endpoint can resume. Its client session endpoint must not expose it.
 */
function wrapAuthHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const response = await handler(request);
    if (!isSessionRequest(request)) return response;
    if (response.body === null) return response;

    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      // A malformed session response cannot safely be forwarded to a client.
      return jsonResponseLike(response, null);
    }

    if (payload === null) return response;
    if (!isRecord(payload)) return jsonResponseLike(response, null);

    const hasDeletionSubject = Object.hasOwn(payload, "deletionUserId");
    const hasLifecycleMarker = Object.hasOwn(payload, "accountLifecycle");
    const isDeleting = payload.accountLifecycle === "deleting";
    const invalidLifecycle = hasLifecycleMarker && payload.accountLifecycle !== "active" && !isDeleting;

    if (hasDeletionSubject || isDeleting || invalidLifecycle) {
      // Whitelist only the non-identifying recovery marker and expiry. Do not
      // forward unexpected fields from a malformed restricted projection.
      const safePayload: Record<string, unknown> = { user: {} };
      if (isDeleting) safePayload.accountLifecycle = "deleting";
      if (typeof payload.expires === "string") safePayload.expires = payload.expires;
      return jsonResponseLike(response, safePayload);
    }

    return response;
  };
}

export const GET = wrapAuthHandler(handlers.GET as (request: Request) => Promise<Response>);
export const POST = wrapAuthHandler(handlers.POST as (request: Request) => Promise<Response>);
