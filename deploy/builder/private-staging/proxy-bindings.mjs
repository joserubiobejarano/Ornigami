#!/usr/bin/env node
/**
 * Structural validation for the staging proxy's published ports.
 *
 * The approved surface is exactly 80/tcp on host 80, 443/tcp on host 443 and
 * 443/udp on host 443. Docker may express the default wildcard bind as an empty
 * HostIp, 0.0.0.0 or ::. Every other container port, protocol, host port,
 * binding address or duplicate binding is rejected.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WILDCARD_ADDRESSES = Object.freeze(["", "0.0.0.0", "::"]);

export const APPROVED_PROXY_BINDINGS = Object.freeze({
  "80/tcp": Object.freeze({ hostPort: "80", addresses: WILDCARD_ADDRESSES }),
  "443/tcp": Object.freeze({ hostPort: "443", addresses: WILDCARD_ADDRESSES }),
  "443/udp": Object.freeze({ hostPort: "443", addresses: WILDCARD_ADDRESSES }),
});

function parse(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value ?? "{}"));
  } catch (error) {
    throw new Error(`port bindings are not valid JSON: ${error.message}`);
  }
}

export function validateProxyBindings(bindings, expected = APPROVED_PROXY_BINDINGS) {
  let actual;
  try {
    actual = parse(bindings);
  } catch (error) {
    return { ok: false, errors: [error.message], expected, observed: null };
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return { ok: false, errors: ["port bindings must be an object keyed by container port/protocol"], expected, observed: actual };
  }
  const errors = [];
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) errors.push(`unexpected container binding: ${key}`);
  }
  for (const key of expectedKeys) {
    const spec = expected[key];
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
        errors.push(`unexpected bind address for ${key}: ${hostIp || "<empty>"}`);
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
    expected,
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
  if (!input && json === null) {
    console.error("usage: proxy-bindings.mjs (--input <json-file> | --bindings-json <json>) [--output <json>]");
    process.exit(2);
  }
  const source = input ? readFileSync(input, "utf8") : json;
  const result = validateProxyBindings(source);
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (output) writeFileSync(output, body);
  process.stdout.write(body);
  if (!result.ok) process.exitCode = 1;
}
