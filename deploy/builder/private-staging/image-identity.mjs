#!/usr/bin/env node
/**
 * Resolve and verify an immutable builder image identity.
 *
 * This helper is deliberately independent of the engine. Callers inspect an
 * image first and pass the resulting `docker image inspect` JSON here. Reference
 * parsing rejects mutable tags so an existing-image qualification cannot
 * silently substitute a different build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const IMMUTABLE_IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
export const IMMUTABLE_REPOSITORY_DIGEST = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
export const SOURCE_SHA = /^[0-9a-f]{40}$/;

export function parseImmutableReference(value) {
  const reference = String(value ?? "").trim();
  if (!reference || /\s/.test(reference)) {
    throw new Error("image reference must be an immutable image ID or repo@sha256:<digest>");
  }
  if (IMMUTABLE_IMAGE_ID.test(reference)) {
    return { reference, imageId: reference, digest: reference.slice("sha256:".length), kind: "image-id" };
  }
  if (IMMUTABLE_REPOSITORY_DIGEST.test(reference)) {
    return {
      reference,
      imageId: null,
      digest: reference.slice(reference.indexOf("@") + 1),
      kind: "repository-digest",
    };
  }
  throw new Error(
    `refusing mutable or unsupported image reference: ${reference} (use sha256:<64-hex> or repo@sha256:<64-hex>)`,
  );
}

function firstInspect(inspect) {
  const image = Array.isArray(inspect) ? inspect[0] : inspect;
  if (!image || typeof image !== "object") throw new Error("image inspect JSON is empty");
  return image;
}

export function inspectImageIdentity(inspect) {
  const image = firstInspect(inspect);
  const labels = image.Config?.Labels ?? {};
  return {
    imageId: image.Id ?? null,
    sourceSha: labels["org.opencontainers.image.revision"] ?? null,
    origin: labels["org.ornigami.public-origin"] ?? null,
    platform: image.Os && image.Architecture ? `${image.Os}/${image.Architecture}` : null,
    user: image.Config?.User ?? null,
    runLabel: labels["org.ornigami.qualify.run"] ?? null,
    singleReplica: labels["org.ornigami.single-replica"] ?? null,
    operatorCli: labels["org.ornigami.operator-cli"] ?? null,
  };
}

export function verifyImageIdentity(
  inspect,
  {
    expectedImageId,
    expectedSourceSha,
    expectedOrigin,
    expectedPlatform = "linux/amd64",
    expectedUser = "1000:1000",
  } = {},
) {
  const observed = inspectImageIdentity(inspect);
  const errors = [];
  if (!IMMUTABLE_IMAGE_ID.test(observed.imageId ?? "")) {
    errors.push(`image ID is not immutable: ${observed.imageId}`);
  }
  if (expectedImageId && observed.imageId !== expectedImageId) {
    errors.push(`image ID mismatch: expected ${expectedImageId}, got ${observed.imageId}`);
  }
  if (expectedSourceSha && observed.sourceSha !== expectedSourceSha) {
    errors.push(`source SHA mismatch: expected ${expectedSourceSha}, got ${observed.sourceSha}`);
  }
  if (expectedOrigin && observed.origin !== expectedOrigin) {
    errors.push(`origin mismatch: expected ${expectedOrigin}, got ${observed.origin}`);
  }
  if (observed.platform !== expectedPlatform) {
    errors.push(`platform mismatch: expected ${expectedPlatform}, got ${observed.platform}`);
  }
  if (observed.user !== expectedUser) {
    errors.push(`user mismatch: expected ${expectedUser}, got ${observed.user}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    expected: {
      imageId: expectedImageId ?? null,
      sourceSha: expectedSourceSha ?? null,
      origin: expectedOrigin ?? null,
      platform: expectedPlatform,
      user: expectedUser,
    },
    observed,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inspectPath = option("--inspect");
  const output = option("--output");
  if (!inspectPath) {
    console.error(
      "usage: image-identity.mjs --inspect <json> [--expected-image-id <id>] [--expected-source-sha <sha>] [--expected-origin <url>] [--expected-platform <os/arch>] [--expected-user <user>] [--output <json>]",
    );
    process.exit(2);
  }
  const result = verifyImageIdentity(JSON.parse(readFileSync(inspectPath, "utf8")), {
    expectedImageId: option("--expected-image-id") ?? undefined,
    expectedSourceSha: option("--expected-source-sha") ?? undefined,
    expectedOrigin: option("--expected-origin") ?? undefined,
    expectedPlatform: option("--expected-platform") ?? undefined,
    expectedUser: option("--expected-user") ?? undefined,
  });
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (output) writeFileSync(output, body);
  process.stdout.write(body);
  if (!result.ok) process.exitCode = 1;
}
