#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const requestedRoot = process.argv[2];
if (!requestedRoot) {
  console.error("usage: node scripts/verification/ornigami-build-artifact-inventory.mjs <next-dist-dir>");
  process.exit(2);
}

const distRoot = resolve(requestedRoot);
const manifestPath = join(distRoot, "server", "subresource-integrity-manifest.json");
const companionPath = join(distRoot, "server", "subresource-integrity-manifest.js");
const cspPath = join(distRoot, "static-csp-hashes.json");
if (![manifestPath, companionPath, cspPath].every(existsSync)) {
  console.error("required build artifact is missing");
  process.exit(2);
}

function insideDist(path) {
  const absolute = resolve(distRoot, path);
  return absolute !== distRoot && absolute.startsWith(`${distRoot}${sep}`);
}

function sha256Integrity(bytes) {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}

function walkFiles(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const sriManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sriEntries = Object.entries(sriManifest).map(([path, expectedIntegrity]) => {
  if (!insideDist(path)) return { path, expectedIntegrity, actualIntegrity: null, exists: false, matches: false, status: "unsafe_manifest_path" };
  const emittedPath = resolve(distRoot, path);
  const exists = existsSync(emittedPath) && statSync(emittedPath).isFile();
  const actualIntegrity = exists ? sha256Integrity(readFileSync(emittedPath)) : null;
  return {
    path: path.replaceAll("\\", "/"),
    expectedIntegrity,
    actualIntegrity,
    exists,
    matches: actualIntegrity === expectedIntegrity,
    status: !exists ? "missing" : actualIntegrity === expectedIntegrity ? "match" : "digest_mismatch",
  };
});

const companionSource = readFileSync(companionPath, "utf8");
const companionAssignment = companionSource.match(/self\.__SUBRESOURCE_INTEGRITY_MANIFEST=(.*)$/s);
let companionManifest = null;
let companionMatchesJson = false;
if (companionAssignment) {
  try {
    companionManifest = JSON.parse(JSON.parse(companionAssignment[1]));
    companionMatchesJson = JSON.stringify(companionManifest) === JSON.stringify(sriManifest);
  } catch {
    companionManifest = null;
  }
}

const allFiles = walkFiles(distRoot);
const emittedMaps = allFiles
  .filter((path) => path.endsWith(".map"))
  .map((path) => relative(distRoot, path).replaceAll("\\", "/"))
  .sort();
const javascriptFiles = allFiles.filter((path) => path.endsWith(".js"));
const sentryNamedArtifacts = allFiles
  .filter((path) => /sentry/i.test(relative(distRoot, path)))
  .map((path) => relative(distRoot, path).replaceAll("\\", "/"))
  .sort();
const javascriptWithSentryStrings = javascriptFiles
  .filter((path) => /sentry|ingest\.sentry/i.test(readFileSync(path, "utf8")))
  .map((path) => relative(distRoot, path).replaceAll("\\", "/"))
  .sort();

const appServerRoot = join(distRoot, "server", "app");
const staticHtml = allFiles
  .filter((path) => path.startsWith(`${appServerRoot}${sep}`) && path.endsWith(".html"))
  .sort();
const recomputedCspHashes = new Set();
for (const path of staticHtml) {
  const html = readFileSync(path, "utf8");
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1]) recomputedCspHashes.add(createHash("sha256").update(match[1], "utf8").digest("base64"));
  }
}
const declaredCspHashes = JSON.parse(readFileSync(cspPath, "utf8"));
const actualCspHashes = [...recomputedCspHashes].sort();
const sortedDeclaredCspHashes = [...declaredCspHashes].sort();

const missing = sriEntries.filter((entry) => !entry.exists);
const mismatches = sriEntries.filter((entry) => entry.exists && !entry.matches);
const report = {
  distDirectory: ".next",
  manifestPath: ".next/server/subresource-integrity-manifest.json",
  manifestEntryCount: sriEntries.length,
  presentEntryCount: sriEntries.filter((entry) => entry.exists).length,
  missingEntryCount: missing.length,
  matchingDigestCount: sriEntries.filter((entry) => entry.matches).length,
  digestMismatchCount: mismatches.length,
  missing,
  mismatches,
  sriEntries,
  companionManifest: {
    path: ".next/server/subresource-integrity-manifest.js",
    assignmentParsed: companionManifest !== null,
    equalsJsonManifest: companionMatchesJson,
  },
  sourceMaps: {
    emittedCount: emittedMaps.length,
    emittedPaths: emittedMaps,
    missingSriMapCount: missing.filter((entry) => entry.path.endsWith(".map")).length,
    missingSriMapPaths: missing.filter((entry) => entry.path.endsWith(".map")).map((entry) => entry.path),
  },
  staticCsp: {
    staticHtmlPageCount: staticHtml.length,
    staticHtmlPaths: staticHtml.map((path) => relative(distRoot, path).replaceAll("\\", "/")),
    declaredHashCount: declaredCspHashes.length,
    recomputedHashCount: actualCspHashes.length,
    hashesEqual: JSON.stringify(actualCspHashes) === JSON.stringify(sortedDeclaredCspHashes),
    declaredHashes: sortedDeclaredCspHashes,
    recomputedHashes: actualCspHashes,
  },
  sentryArtifacts: {
    filenamesContainingSentryCount: sentryNamedArtifacts.length,
    filenamesContainingSentry: sentryNamedArtifacts,
    instrumentationArtifactPresent: existsSync(join(distRoot, "server", "instrumentation.js")),
    javascriptFilesContainingSentryStringsCount: javascriptWithSentryStrings.length,
    javascriptFilesContainingSentryStrings: javascriptWithSentryStrings,
    telemetryExecutionEstablished: false,
  },
};

console.log(JSON.stringify(report, null, 2));
