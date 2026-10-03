#!/usr/bin/env node

/**
 * Read-only, offline Google OAuth configuration inventory for A16.
 * Reads process.env only. Provider approval and Console state always require
 * separate human/provider evidence and are never inferred from local config.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const GOOGLE_CALLBACK_PATHS = Object.freeze({
  authJs: "/api/auth/callback/google",
  businessProfile: "/api/google/oauth/callback",
});

const GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";
const CANONICAL_PRODUCTION_URL = "https://ornigami.com";
const PLACEHOLDER_RE = /^(?:change(?:me)?|replace(?:me)?|example|your[-_ ]|<|\[)/i;
const ROOT_ORIGIN_SHAPE = /^https?:\/\/[^/?#\\\u0000-\u0020\u007f]+\/*$/i;
const AUTH_BASE_SHAPE = /^https?:\/\/[^/?#\\\u0000-\u0020\u007f]+(?:\/api\/auth)?\/?$/i;

function runtimeAppBaseUrl(env) {
  const raw = typeof env.NEXT_PUBLIC_APP_URL === "string" ? env.NEXT_PUBLIC_APP_URL.trim() : "";
  const candidate = raw || "http://localhost:3000";
  try {
    if (!ROOT_ORIGIN_SHAPE.test(candidate)) return null;
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname.replace(/\/+$/, "") !== "" || parsed.search || parsed.hash) return null;
    return candidate.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function configuredUrl(value) {
  if (value === undefined || value === null) return { present: false, url: null };
  if (typeof value !== "string" || !value.trim()) return { present: true, url: null };
  try {
    const raw = value.trim();
    if (!AUTH_BASE_SHAPE.test(raw)) return { present: true, url: null };
    const parsed = new URL(raw);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
        !["", "/api/auth"].includes(normalizedPath) || parsed.search || parsed.hash) {
      return { present: true, url: null };
    }
    return { present: true, url: parsed.origin, path: normalizedPath };
  } catch {
    return { present: true, url: null };
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Inspect local OAuth configuration without network access or secret output.
 * `environment` is local, preview, or production. Result statuses never claim
 * Google approval or provider acceptance.
 * @param {{ env?: Record<string, string | undefined>, environment?: "local" | "preview" | "production" }} [options]
 */
export function checkGoogleReadiness({ env = process.env, environment = "local" } = {}) {
  if (!["local", "preview", "production"].includes(environment)) {
    throw new TypeError("environment must be local, preview, or production");
  }

  const checks = [];
  const add = (id, status, evidenceType, detail) => checks.push({ id, status, evidenceType, detail });
  for (const key of ["AUTH_SECRET", "NEXTAUTH_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
    if (typeof env[key] === "string" && !env[key].trim()) {
      add(`${key.toLowerCase()}_blank`, "fail", "local-config+runtime-source",
        `${key} is explicitly configured but blank. Remove an unused value or supply a non-empty secret; configured empty values are not safe runtime fallbacks.`);
    }
  }
  const baseUrl = runtimeAppBaseUrl(env);
  const appUrlRaw = nonEmpty(env.NEXT_PUBLIC_APP_URL);
  const clientIdPresent = nonEmpty(env.GOOGLE_CLIENT_ID);
  const clientSecretPresent = nonEmpty(env.GOOGLE_CLIENT_SECRET);
  const authSecretPresent = nonEmpty(env.AUTH_SECRET);
  const nextAuthSecretPresent = nonEmpty(env.NEXTAUTH_SECRET);
  const encryptionKeyPresent = nonEmpty(env.TOKEN_ENCRYPTION_KEY);
  const clientIdLooksValid = clientIdPresent && env.GOOGLE_CLIENT_ID.trim().endsWith(GOOGLE_CLIENT_ID_SUFFIX);
  const clientSecretLooksPlaceholder = clientSecretPresent && PLACEHOLDER_RE.test(env.GOOGLE_CLIENT_SECRET.trim());

  add("google_client_id_present", clientIdPresent ? "pass" : "fail", "local-config",
    clientIdPresent ? "Configured; value withheld." : "GOOGLE_CLIENT_ID is missing.");
  add("google_client_id_format", !clientIdPresent ? "fail" : clientIdLooksValid ? "pass" : "warn", "local-config",
    !clientIdPresent ? "Cannot inspect format because the value is missing." : clientIdLooksValid ? "Google OAuth client ID has the expected suffix; ownership is unverified." : "Value is present but does not have the usual Google OAuth client ID suffix; value withheld.");
  add("google_client_secret_present", clientSecretPresent ? "pass" : "fail", "local-config",
    clientSecretPresent ? "Configured; value withheld." : "GOOGLE_CLIENT_SECRET is missing.");
  add("google_client_secret_placeholder", !clientSecretPresent ? "fail" : clientSecretLooksPlaceholder ? "fail" : "pass", "local-config",
    !clientSecretPresent ? "Cannot inspect placeholder status because the value is missing." : clientSecretLooksPlaceholder ? "Value resembles a placeholder; value withheld." : "No obvious placeholder prefix detected; validity is unverified.");

  const productionRuntime = environment === "production" || env.NODE_ENV === "production";
  const signingSecretPresent = authSecretPresent || nextAuthSecretPresent;
  add("oauth_state_signing_secret", signingSecretPresent ? "pass" : productionRuntime ? "fail" : "warn", "local-config+runtime-source",
    signingSecretPresent ? "OAuth state signing secret is configured; value withheld." : productionRuntime ? "AUTH_SECRET or NEXTAUTH_SECRET is required when NODE_ENV or target environment is production." : "AUTH_SECRET/NEXTAUTH_SECRET is absent; runtime uses its development fallback outside production.");
  add("google_token_encryption_key", encryptionKeyPresent || signingSecretPresent ? "pass" : productionRuntime ? "fail" : "warn", "local-config+runtime-source",
    encryptionKeyPresent ? "TOKEN_ENCRYPTION_KEY is configured; value withheld." : signingSecretPresent ? "Token encryption falls back to AUTH_SECRET, then NEXTAUTH_SECRET; value withheld." : productionRuntime ? "TOKEN_ENCRYPTION_KEY or an AUTH_SECRET/NEXTAUTH_SECRET fallback is required when NODE_ENV or target environment is production." : "No token encryption secret is configured; runtime uses its development fallback outside production.");
  if (authSecretPresent && nextAuthSecretPresent && env.AUTH_SECRET !== env.NEXTAUTH_SECRET) {
    add("auth_secret_alias_conflict", "warn", "local-config+runtime-source", "AUTH_SECRET and NEXTAUTH_SECRET differ. OAuth state and token encryption use AUTH_SECRET first; confirm Auth.js uses the same intended secret.");
  }

  const callbacks = baseUrl ? Object.values(GOOGLE_CALLBACK_PATHS).map((path) => `${baseUrl}${path}`) : [];
  add("runtime_app_base_url", baseUrl ? "pass" : "fail", "runtime-source+local-config",
    baseUrl ? (appUrlRaw ? "Derived from NEXT_PUBLIC_APP_URL after trim and trailing-slash normalization." : "Derived from the runtime localhost fallback because NEXT_PUBLIC_APP_URL is unset.") : "NEXT_PUBLIC_APP_URL is malformed, contains a path/query/fragment, or is unsafe; callback derivation cannot be trusted.");
  add("callback_uris_derived", callbacks.length === 2 ? "pass" : "fail", "runtime-source+local-config",
    callbacks.length === 2 ? "Both callback URIs below follow the application runtime base URL." : "Both callback URIs could not be derived.");

  const authUrl = configuredUrl(env.AUTH_URL);
  const nextAuthUrl = configuredUrl(env.NEXTAUTH_URL);
  const effectiveAuthUrl = authUrl.present ? authUrl : nextAuthUrl;
  const authUrlConflict = effectiveAuthUrl.present && (!effectiveAuthUrl.url || (baseUrl && effectiveAuthUrl.url !== baseUrl));
  const nextAuthUrlConflict = !authUrl.present && nextAuthUrl.present && (!nextAuthUrl.url || (baseUrl && nextAuthUrl.url !== baseUrl));
  add("auth_url_alignment", authUrlConflict ? "warn" : "pass", "local-config",
    !authUrl.present ? "AUTH_URL is unset; Auth.js can use NEXTAUTH_URL as its legacy alias. The Business Profile callback helper reads neither URL hint." : authUrlConflict ? "Effective Auth.js URL hint is malformed or differs from NEXT_PUBLIC_APP_URL; Auth.js callback origin may diverge. Value withheld." : "Effective Auth.js URL hint origin aligns with NEXT_PUBLIC_APP_URL. This hint does not override the Business Profile callback helper.");
  add("nextauth_url_alignment", nextAuthUrlConflict ? "warn" : "pass", "local-config",
    !nextAuthUrl.present ? "NEXTAUTH_URL is unset; no legacy URL hint is configured." : authUrl.present ? "NEXTAUTH_URL is shadowed by AUTH_URL in the pinned Auth.js runtime; the app's Business Profile callback helper does not read it." : nextAuthUrlConflict ? "NEXTAUTH_URL is malformed or differs from NEXT_PUBLIC_APP_URL; Auth.js callback origin may diverge. Value withheld." : "NEXTAUTH_URL aligns with NEXT_PUBLIC_APP_URL; the app's Business Profile callback helper does not read it.");
  if (authUrl.present && nextAuthUrl.present && authUrl.url !== nextAuthUrl.url) {
    add("auth_url_alias_conflict", "warn", "local-config", "AUTH_URL and NEXTAUTH_URL differ; Auth.js may prefer AUTH_URL. Resolve the conflict in deployment configuration.");
  }

  if (environment === "production") {
    add("production_app_url", baseUrl === CANONICAL_PRODUCTION_URL ? "pass" : "fail", "local-config",
      baseUrl === CANONICAL_PRODUCTION_URL ? "Production base URL matches https://ornigami.com." : "Production base URL must be exactly https://ornigami.com.");
    add("production_https", baseUrl?.startsWith("https://") ? "pass" : "fail", "local-config",
      baseUrl?.startsWith("https://") ? "Production callback origins use HTTPS." : "Production callbacks require HTTPS.");
  } else if (baseUrl?.startsWith("http://") && environment === "preview") {
    add("preview_https", "warn", "local-config", "Preview callback base URL uses HTTP; verify the intended provider registration and deployment origin.");
  }

  add("google_business_manage_scope", "pass", "runtime-source", "The Business Profile OAuth implementation requests the business.manage scope.");

  const providerGates = [
    ["basic_api_access_approval", "Google Basic API Access approval and nonzero quota require Cloud Console/provider evidence."],
    ["reviews_api_enabled", "Google My Business API availability and enablement require Cloud Console/provider evidence."],
    ["consent_branding_and_domain", "OAuth branding, authorized domain, and verification status require Google Auth Platform evidence."],
    ["registered_redirect_uris", "Registered callback URIs require direct Google Cloud Console evidence."],
    ["eligible_client_profile_access", "A verified, active client profile and applicant Manager access require account/owner evidence."],
    ["live_oauth_and_workflow_smoke", "A real controlled OAuth, discovery, sync, draft, post, and scheduled workflow requires provider acceptance evidence."],
  ];
  for (const [id, detail] of providerGates) add(id, "unverified", "provider", detail);

  const localFailures = checks.some((check) => check.evidenceType !== "provider" && check.status === "fail");
  const localWarnings = checks.some((check) => check.evidenceType !== "provider" && check.status === "warn");
  const callbacksForOutput = callbacks.map((uri, index) => ({
    purpose: index === 0 ? "authjs_google_sign_in_expected_registration" : "business_profile_oauth_runtime_redirect",
    uri,
    evidenceType: "derived-local-config",
    providerRegistration: "unverified",
  }));
  return {
    schema: "ornigami.a16.google-readiness.v1",
    environment,
    overallStatus: "provider-unverified",
    localConfigStatus: localFailures ? "blocked" : localWarnings ? "review" : "ready",
    providerStatus: "unverified",
    networkAccess: false,
    providerMutations: false,
    secretValuesIncluded: false,
    callbacks: callbacksForOutput,
    checks,
    summary: localFailures
      ? "Local configuration has blocking findings; provider readiness remains unverified."
      : localWarnings
        ? "Local configuration has findings to review; provider readiness remains unverified."
        : "Local configuration checks passed; provider readiness remains unverified.",
  };
}

function parseArgs(args) {
  let json = false;
  let environment = process.env.NODE_ENV === "production" ? "production" : "local";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") json = true;
    else if (arg === "--environment") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Invalid environment option.");
      environment = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true, json, environment };
    } else {
      throw new Error("Unknown command-line argument.");
    }
  }
  if (!["local", "preview", "production"].includes(environment)) throw new Error("Invalid environment option.");
  return { json, environment };
}

function printHuman(result) {
  console.log(`Google OAuth local configuration: ${result.localConfigStatus}`);
  console.log(`Provider readiness: ${result.providerStatus}`);
  for (const callback of result.callbacks) console.log(`Callback (${callback.purpose}): ${callback.uri}`);
  for (const check of result.checks.filter((item) => item.status === "fail" || item.status === "warn" || item.status === "unverified")) {
    console.log(`${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
  }
  console.log(result.summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/a16-google-readiness.mjs [--json] [--environment local|preview|production]");
      process.exitCode = 0;
    } else {
      const result = checkGoogleReadiness({ env: process.env, environment: options.environment });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printHuman(result);
      process.exitCode = result.localConfigStatus === "ready" ? 0 : 1;
    }
  } catch {
    console.error("Invalid command line. Use --help for usage.");
    process.exitCode = 2;
  }
}
