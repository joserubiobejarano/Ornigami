#!/usr/bin/env node
/**
 * Structural validation for the staging proxy's published ports.
 *
 * The approved surface is exactly 80/tcp on host 80, 443/tcp on host 443 and
 * 443/udp on host 443. Two explicit profiles are supported:
 *   wildcard  existing internet-facing scope; empty, 0.0.0.0 or :: addresses.
 *   loopback  temporary local private-edge scope; 127.0.0.1 or ::1 only.
 *
 * The profile is selected explicitly. Extra container ports, protocols, host
 * ports, wrong addresses, duplicate bindings or a mixture of profiles are
 * rejected rather than accepted through a weakened wildcard rule.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WILDCARD_ADDRESSES = Object.freeze(["", "0.0.0.0", "::"]);
const LOOPBACK_ADDRESSES = Object.freeze(["127.0.0.1", "::1"]);

function profileBindings(addresses) {
  return Object.freeze({
    "80/tcp": Object.freeze({ hostPort: "80", addresses }),
    "443/tcp": Object.freeze({ hostPort: "443", addresses }),
    "443/udp": Object.freeze({ hostPort: "443", addresses }),
  });
}

export const PROXY_BINDING_PROFILES = Object.freeze({
  wildcard: profileBindings(WILDCARD_ADDRESSES),
  loopback: profileBindings(LOOPBACK_ADDRESSES),
});

export const APPROVED_PROXY_BINDINGS = PROXY_BINDING_PROFILES.wildcard;

function parse(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value ?? "{}"));
  } catch (error) {
    throw new Error(`port bindings are not valid JSON: ${error.message}`);
  }
}

function resolveProfile(profile) {
  if (typeof profile === "string") {
    const expected = PROXY_BINDING_PROFILES[profile];
    return expected ? { name: profile, expected } : null;
  }
  if (profile && typeof profile === "object" && typeof profile.profile === "string") {
    const expected = PROXY_BINDING_PROFILES[profile.profile];
    return expected ? { name: profile.profile, expected } : null;
  }
  // Preserve the old custom-expected-object form for focused callers.
  if (profile && typeof profile === "object") {
    return { name: "custom", expected: profile };
  }
  return null;
}

export function validateProxyBindings(bindings, profile = "wildcard") {
  const selected = resolveProfile(profile);
  if (!selected) {
    return {
      ok: false,
      errors: [`unknown proxy binding profile: ${String(profile)}`],
      profile: null,
      expected: null,
      observed: null,
    };
  }
  let actual;
  try {
    actual = parse(bindings);
  } catch (error) {
    return { ok: false, errors: [error.message], profile: selected.name, expected: selected.expected, observed: null };
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return {
      ok: false,
      errors: ["port bindings must be an object keyed by container port/protocol"],
      profile: selected.name,
      expected: selected.expected,
      observed: actual,
    };
  }
  const errors = [];
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(selected.expected);
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) errors.push(`unexpected container binding: ${key}`);
  }
  for (const key of expectedKeys) {
    const spec = selected.expected[key];
    const entries = actual[key];
    if (!Array.isArray(entries) || entries.length === 0) {
      errors.push(`missing container binding: ${key}`);
      continue;
    }
    const seenAddresses = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        errors.push(`invalid binding entry for ${key}`);
        continue;
      }
      const hostIp = String(entry.HostIp ?? "");
      const hostPort = String(entry.HostPort ?? "");
      if (hostPort !== spec.hostPort) {
        errors.push(`unexpected host port for ${key}: expected ${spec.hostPort}, got ${hostPort || "<empty>"}`);
      }
      if (!spec.addresses.includes(hostIp)) {
        const otherProfile = Object.entries(PROXY_BINDING_PROFILES).find(
          ([name, expected]) => name !== selected.name && expected[key]?.addresses.includes(hostIp),
        );
        errors.push(
          otherProfile
            ? `mixed proxy binding profile for ${key}: ${otherProfile[0]} address ${hostIp} is not allowed in ${selected.name}`
            : `unexpected bind address for ${key}: ${hostIp || "<empty>"}`,
        );
      }
      if (seenAddresses.has(hostIp)) {
        errors.push(`duplicate bind address for ${key}: ${hostIp || "<empty>"}`);
      }
      seenAddresses.add(hostIp);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    profile: selected.name,
    expected: selected.expected,
    observed: actual,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = option("--input");
  const json = option("--bindings-json");
  const output = option("--output");
  const profile = option("--profile") ?? "wildcard";
  if (!input && json === null) {
    console.error("usage: proxy-bindings.mjs (--input <json-file> | --bindings-json <json>) [--profile wildcard|loopback] [--output <json>]");
    process.exit(2);
  }
  const source = input ? readFileSync(input, "utf8") : json;
  const result = validateProxyBindings(source, profile);
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (output) writeFileSync(output, body);
  process.stdout.write(body);
  if (!result.ok) process.exitCode = 1;
}
