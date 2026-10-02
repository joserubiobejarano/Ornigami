import { decryptToken } from "./encrypted-token.ts";
import { getRequiredEnv, getServerAppUrl } from "./env.ts";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_SKEW_MS = 120_000;
const TOKEN_TIMEOUT_MS = 10_000;
const API_TIMEOUT_MS = 12_000;
const MAX_API_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 2_000;
const API_ORIGINS = new Set([
  "https://mybusinessaccountmanagement.googleapis.com",
  "https://mybusinessbusinessinformation.googleapis.com",
  "https://mybusiness.googleapis.com",
]);

/** Must match the URI registered in Google Cloud Console (Authorized redirect URIs). */
export function getGoogleGbpOAuthRedirectUri(): string {
  return `${getServerAppUrl()}/api/google/oauth/callback`;
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
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

export type GoogleOAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string | null;
  connection_version: string;
  stored_access_token: string;
  stored_refresh_token: string;
};

type TokenSnapshot = Pick<Tokens, "connection_version" | "stored_access_token" | "stored_refresh_token">;

export class GoogleConnectionVersionError extends Error {
  constructor() {
    super("Google connection changed since location selection.");
    this.name = "GoogleConnectionVersionError";
  }
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTokenResponse(value: unknown, requireRefreshToken: boolean): TokenResponse {
  if (!isRecord(value)) throw new Error("Google returned an invalid token response.");
  const { access_token, refresh_token, expires_in, token_type, scope } = value;
  if (
    typeof access_token !== "string" || access_token.length === 0 || access_token.length > 16_384 ||
    typeof expires_in !== "number" || !Number.isFinite(expires_in) || expires_in <= 0 || expires_in > 31_536_000 ||
    typeof token_type !== "string" || token_type.toLowerCase() !== "bearer" ||
    (refresh_token !== undefined && (typeof refresh_token !== "string" || refresh_token.length === 0 || refresh_token.length > 16_384)) ||
    (scope !== undefined && typeof scope !== "string") ||
    (requireRefreshToken && typeof refresh_token !== "string")
  ) {
    throw new Error("Google returned an invalid token response.");
  }
  return {
    access_token,
    ...(typeof refresh_token === "string" ? { refresh_token } : {}),
    expires_in,
    ...(typeof scope === "string" ? { scope } : {}),
    token_type,
  };
}

async function tokenRequest(body: URLSearchParams, requireRefreshToken: boolean): Promise<TokenResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Google token request failed (${response.status}).`);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Google returned an invalid token response.");
    }
    return parseTokenResponse(payload, requireRefreshToken);
  } catch (error) {
    if (error instanceof Error && /^Google (token request failed|returned an invalid token response)/.test(error.message)) throw error;
    throw new Error("Google token request failed.");
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokens & { refresh_token: string }> {
  const body = new URLSearchParams({
    code,
    client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: getGoogleGbpOAuthRedirectUri(),
    grant_type: "authorization_code",
  });
  const tokens = await tokenRequest(body, true);
  if (!tokens.refresh_token) throw new Error("Google returned an invalid token response.");
  return tokens as GoogleOAuthTokens & { refresh_token: string };
}

export async function refreshAccessToken(refresh_token: string): Promise<GoogleOAuthTokens> {
  if (!refresh_token) throw new Error("Google refresh token is missing.");
  const body = new URLSearchParams({
    refresh_token,
    client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  return tokenRequest(body, false);
}

function validExpiry(expiresAt: string): number {
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) throw new Error("Stored Google token expiry is invalid.");
  return timestamp;
}

function isExpired(expiresAt: string, now = Date.now()): boolean {
  return now + TOKEN_SKEW_MS >= validExpiry(expiresAt);
}

/** Reads encrypted-at-rest credentials and upgrades legacy plaintext rows on first use. */
export async function getUserGoogleTokens(userId: string): Promise<Tokens | null> {
  let rows;
  try {
    const { getSql } = await import("./db/neon.ts");
    const sql = getSql();
    rows = await sql`
      SELECT access_token, refresh_token, expires_at, scope, connection_version
      FROM public.gbp_connections
      WHERE user_id = ${userId}
      LIMIT 1
    `;
  } catch {
    throw new Error("Google credentials could not be loaded.");
  }
  const data = rows[0] as Tokens | undefined;
  if (!data) return null;
  return decodeGoogleTokenRow(userId, data);
}

export async function decodeGoogleTokenRow(
  userId: string,
  data: Tokens,
  save?: (input: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    scope: string | null;
    expectedConnectionVersion: string;
    expectedEncryptedAccessToken: string;
    expectedEncryptedRefreshToken: string;
  }) => Promise<boolean | void>
): Promise<Tokens> {
  if (typeof data.connection_version !== "string" || data.connection_version.length === 0) {
    throw new Error("Stored Google credentials are invalid.");
  }
  let access: ReturnType<typeof decryptToken>;
  let refresh: ReturnType<typeof decryptToken>;
  try {
    access = decryptToken(data.access_token);
    refresh = decryptToken(data.refresh_token);
  } catch {
    throw new Error("Stored Google credentials could not be decrypted.");
  }
  const result = {
    ...data,
    access_token: access.value,
    refresh_token: refresh.value,
    connection_version: data.connection_version,
    stored_access_token: data.stored_access_token ?? data.access_token,
    stored_refresh_token: data.stored_refresh_token ?? data.refresh_token,
  };
  if (!result.access_token || !result.refresh_token) throw new Error("Stored Google credentials are invalid.");
  validExpiry(result.expires_at);
  if (access.legacy || refresh.legacy) {
    try {
      const persist = save ?? (await import("./db/gbp.ts")).updateGbpTokensIfCurrent;
      const saved = await persist({
        userId,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: result.expires_at,
        scope: result.scope ?? null,
        expectedConnectionVersion: result.connection_version,
        expectedEncryptedAccessToken: result.stored_access_token,
        expectedEncryptedRefreshToken: result.stored_refresh_token,
      });
      if (saved === false) throw new Error("credentials changed");
    } catch {
      throw new Error("Stored Google credentials could not be upgraded.");
    }
  }
  return result;
}

type GoogleClientDependencies = {
  getTokens: (ownerUserId: string) => Promise<Tokens | null>;
  saveTokens: (ownerUserId: string, tokens: Tokens, expected: TokenSnapshot) => Promise<boolean | void>;
  refresh: (refreshToken: string) => Promise<GoogleOAuthTokens>;
  fetcher: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  requestTimeoutMs: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function safeApiUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Google API URL is invalid.");
  }
  if (
    url.protocol !== "https:" || !API_ORIGINS.has(url.origin) || url.username || url.password || url.hash
  ) {
    throw new Error("Google API URL is not allowed.");
  }
  return url;
}

function retryableRequest(method: string, url: URL, body: BodyInit | null | undefined): boolean {
  if (method === "GET") return true;
  if (method !== "PUT" || !/\/reviews\/[^/]+\/reply\/?$/.test(url.pathname)) return false;
  return body == null || typeof body === "string" || body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof FormData;
}

function retryDelay(response: Response, retryIndex: number, now: number): number | null {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed <= MAX_RETRY_DELAY_MS ? parsed : null;
  }
  return Math.min(250 * 2 ** retryIndex, MAX_RETRY_DELAY_MS);
}

function keepTimeoutForBody(response: Response, cleanup: () => void): Response {
  if (!response.body) {
    cleanup();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          cleanup();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch {
        controller.error(new Error("Google API response body failed."));
        cleanup();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        cleanup();
      }
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function tokensFromRefresh(current: Tokens, received: GoogleOAuthTokens, now: number): Tokens {
  const parsed = parseTokenResponse(received, false);
  return {
    ...current,
    access_token: parsed.access_token,
    // Google omits refresh_token on routine refreshes; keep the encrypted stored credential.
    refresh_token: parsed.refresh_token ?? current.refresh_token,
    expires_at: new Date(now + parsed.expires_in * 1000).toISOString(),
    scope: parsed.scope ?? current.scope ?? null,
  };
}

/** Factory keeps transport and token storage replaceable for deterministic unit tests. */
export function createGoogleClient(dependencies: GoogleClientDependencies) {
  const refreshes = new Map<string, Promise<Tokens>>();

  function assertExpectedConnectionVersion(tokens: Tokens, expectedConnectionVersion?: string): void {
    if (expectedConnectionVersion !== undefined && tokens.connection_version !== expectedConnectionVersion) {
      throw new GoogleConnectionVersionError();
    }
  }

  async function refreshOwner(
    ownerUserId: string,
    fallback: Tokens,
    force: boolean,
    expectedConnectionVersion?: string
  ): Promise<Tokens> {
    const active = refreshes.get(ownerUserId);
    if (active) {
      const refreshed = await active;
      assertExpectedConnectionVersion(refreshed, expectedConnectionVersion);
      return refreshed;
    }
    const operation = (async () => {
      const latest = await dependencies.getTokens(ownerUserId);
      if (!latest) {
        if (expectedConnectionVersion !== undefined) throw new GoogleConnectionVersionError();
        throw new Error("No Google connection found.");
      }
      assertExpectedConnectionVersion(latest, expectedConnectionVersion);
      const latestIsFresh = !isExpired(latest.expires_at, dependencies.now());
      if (latestIsFresh && (!force || latest.access_token !== fallback.access_token)) {
        assertExpectedConnectionVersion(latest, expectedConnectionVersion);
        return latest;
      }
      let received: GoogleOAuthTokens;
      try {
        received = await dependencies.refresh(latest.refresh_token);
      } catch (error) {
        if (error instanceof Error && /^Google (token request failed|returned an invalid token response|refresh token is missing)/.test(error.message)) throw error;
        throw new Error("Google credentials could not be refreshed.");
      }
      // A disconnect or replacement can race the provider call. Do not keep using a
      // token after the row disappears, or overwrite a newer credential set.
      const current = await dependencies.getTokens(ownerUserId);
      if (!current) throw new Error("No Google connection found.");
      if (
        current.connection_version !== latest.connection_version ||
        current.stored_access_token !== latest.stored_access_token ||
        current.stored_refresh_token !== latest.stored_refresh_token ||
        current.access_token !== latest.access_token || current.refresh_token !== latest.refresh_token
      ) {
        if (!isExpired(current.expires_at, dependencies.now())) {
          assertExpectedConnectionVersion(current, expectedConnectionVersion);
          return current;
        }
        throw new Error("Google credentials changed during refresh.");
      }
      const refreshed = tokensFromRefresh(latest, received, dependencies.now());
      try {
        const saved = await dependencies.saveTokens(ownerUserId, refreshed, {
          connection_version: latest.connection_version,
          stored_access_token: latest.stored_access_token,
          stored_refresh_token: latest.stored_refresh_token,
        });
        if (saved === false) throw new Error("credentials changed");
      } catch {
        throw new Error("Google credentials changed or could not be saved.");
      }
      assertExpectedConnectionVersion(refreshed, expectedConnectionVersion);
      return refreshed;
    })();
    refreshes.set(ownerUserId, operation);
    try {
      return await operation;
    } finally {
      if (refreshes.get(ownerUserId) === operation) refreshes.delete(ownerUserId);
    }
  }

  async function freshTokens(ownerUserId: string, expectedConnectionVersion?: string): Promise<Tokens> {
    const tokens = await dependencies.getTokens(ownerUserId);
    if (!tokens) {
      if (expectedConnectionVersion !== undefined) throw new GoogleConnectionVersionError();
      throw new Error("No Google connection found.");
    }
    assertExpectedConnectionVersion(tokens, expectedConnectionVersion);
    if (!tokens.access_token || !tokens.refresh_token) throw new Error("Stored Google credentials are invalid.");
    if (!isExpired(tokens.expires_at, dependencies.now())) return tokens;
    return refreshOwner(ownerUserId, tokens, false, expectedConnectionVersion);
  }

  async function googleFetch(
    ownerUserId: string,
    input: string | URL,
    options: RequestInit = {},
    expectedConnectionVersion?: string
  ): Promise<Response> {
    const url = safeApiUrl(input);
    const method = (options.method ?? "GET").toUpperCase();
    const canReplay = retryableRequest(method, url, options.body);
    let tokens: Tokens;
    let refreshedAfterUnauthorized = false;
    const maxAttempts = canReplay ? MAX_API_ATTEMPTS : 1;

    for (let attempt = 0; ; attempt += 1) {
      // Re-read before every provider request, including retries after backoff.
      // A selected location is pinned to the credential generation that authorized it.
      tokens = await freshTokens(ownerUserId, expectedConnectionVersion);
      assertExpectedConnectionVersion(tokens, expectedConnectionVersion);
      const controller = new AbortController();
      const externalSignal = options.signal;
      const abortFromCaller = () => controller.abort(externalSignal?.reason);
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, dependencies.requestTimeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abortFromCaller);
      };
      if (externalSignal?.aborted) abortFromCaller();
      else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${tokens.access_token}`);
      let response: Response;
      try {
        response = await dependencies.fetcher(url, {
          ...options,
          method,
          headers,
          signal: controller.signal,
          cache: "no-store",
          redirect: "error",
        });
      } catch {
        cleanup();
        throw new Error(timedOut ? "Google API request timed out." : controller.signal.aborted ? "Google API request was cancelled." : "Google API request failed.");
      }
      response = keepTimeoutForBody(response, cleanup);

      if (response.status === 401 && canReplay && !refreshedAfterUnauthorized) {
        await response.body?.cancel().catch(() => undefined);
        tokens = await refreshOwner(ownerUserId, tokens, true, expectedConnectionVersion);
        assertExpectedConnectionVersion(tokens, expectedConnectionVersion);
        refreshedAfterUnauthorized = true;
        // The refresh is a credential renewal; start a fresh bounded retry window.
        attempt = -1;
        continue;
      }
      if ((response.status === 429 || response.status === 503) && attempt + 1 < maxAttempts) {
        const delay = retryDelay(response, attempt, dependencies.now());
        if (delay === null) return response;
        await response.body?.cancel().catch(() => undefined);
        await dependencies.sleep(delay);
        continue;
      }
      return response;
    }
  }

  return { googleFetch, refreshIfNeeded: (ownerUserId: string, tokens: Tokens) => isExpired(tokens.expires_at, dependencies.now()) ? refreshOwner(ownerUserId, tokens, false) : Promise.resolve(tokens) };
}

const googleClient = createGoogleClient({
  getTokens: getUserGoogleTokens,
  saveTokens: async (userId, tokens, expected) => {
    const { updateGbpTokensIfCurrent } = await import("./db/gbp.ts");
    return updateGbpTokensIfCurrent({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      scope: tokens.scope ?? null,
      expectedConnectionVersion: expected.connection_version,
      expectedEncryptedAccessToken: expected.stored_access_token,
      expectedEncryptedRefreshToken: expected.stored_refresh_token,
    });
  },
  refresh: refreshAccessToken,
  fetcher: fetch,
  now: Date.now,
  sleep: defaultSleep,
  requestTimeoutMs: API_TIMEOUT_MS,
});

export const refreshIfNeeded = googleClient.refreshIfNeeded;
export const googleFetch = googleClient.googleFetch;
