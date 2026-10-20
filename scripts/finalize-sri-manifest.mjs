import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_INTEGRITY = /^sha256-[A-Za-z0-9+/]{43}=$/;
const COMPANION_ASSIGNMENT = "self.__SUBRESOURCE_INTEGRITY_MANIFEST=";

function fail(reason) {
  throw new Error(`SRI finalizer: ${reason}`);
}

function readRegularFile(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile()) fail(`missing regular ${label}`);
  return readFileSync(path);
}

function parseManifest(bytes, label) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") {
    fail(`${label} must be a JSON object`);
  }
  for (const [path, integrity] of Object.entries(manifest)) {
    if (!path || typeof integrity !== "string" || !SHA256_INTEGRITY.test(integrity)) {
      fail(`${label} contains a missing or malformed SHA-256 integrity value`);
    }
  }
  return manifest;
}

function serializeManifest(manifest) {
  const json = JSON.stringify(manifest, null, 2);
  return {
    json,
    javascript: `${COMPANION_ASSIGNMENT}${JSON.stringify(json)}`,
  };
}

function parseBuildId(bytes) {
  const buildId = bytes.toString("utf8").trim();
  if (!buildId || buildId === "." || buildId === ".." || /[\\/\0]/.test(buildId)) {
    fail("BUILD_ID is empty or unsafe");
  }
  return buildId;
}

function sha256Integrity(bytes) {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}

function writePair(jsonPath, javascriptPath, jsonBytes, javascriptBytes) {
  const suffix = `.sri-finalizer-${process.pid}.tmp`;
  const jsonTemporary = `${jsonPath}${suffix}`;
  const javascriptTemporary = `${javascriptPath}${suffix}`;
  const temporaryPaths = [jsonTemporary, javascriptTemporary];
  try {
    writeFileSync(jsonTemporary, jsonBytes, { flag: "wx" });
    writeFileSync(javascriptTemporary, javascriptBytes, { flag: "wx" });
    renameSync(jsonTemporary, jsonPath);
    renameSync(javascriptTemporary, javascriptPath);
  } finally {
    for (const path of temporaryPaths) {
      if (existsSync(path)) unlinkSync(path);
    }
  }
}

export function finalizeSRIManifest(distDirectory = resolve(process.cwd(), ".next")) {
  const distRoot = resolve(distDirectory);
  const buildId = parseBuildId(readRegularFile(join(distRoot, "BUILD_ID"), "build ID"));
  const manifestRelativePath = `static/${buildId}/_ssgManifest.js`;
  const ssgManifestPath = resolve(distRoot, "static", buildId, "_ssgManifest.js");
  if (!ssgManifestPath.startsWith(`${distRoot}${sep}`)) {
    fail("SSG manifest resolves outside the build directory");
  }

  const jsonPath = join(distRoot, "server", "subresource-integrity-manifest.json");
  const javascriptPath = join(distRoot, "server", "subresource-integrity-manifest.js");
  const jsonBytes = readRegularFile(jsonPath, "JSON SRI manifest");
  const javascriptBytes = readRegularFile(javascriptPath, "JavaScript SRI manifest");
  const manifest = parseManifest(jsonBytes, "JSON SRI manifest");
  const originalPair = serializeManifest(manifest);
  if (javascriptBytes.toString("utf8") !== originalPair.javascript) {
    fail("companion JavaScript manifest does not match the JSON manifest");
  }

  const ssgEntries = Object.keys(manifest).filter((path) => path.endsWith("/_ssgManifest.js"));
  if (ssgEntries.length !== 1 || ssgEntries[0] !== manifestRelativePath) {
    fail("compiled manifest must contain exactly the current build's SSG manifest entry");
  }

  const ssgBytes = readRegularFile(ssgManifestPath, "final SSG manifest");
  manifest[manifestRelativePath] = sha256Integrity(ssgBytes);
  const updatedPair = serializeManifest(manifest);
  writePair(
    jsonPath,
    javascriptPath,
    updatedPair.json,
    updatedPair.javascript,
  );

  const writtenManifest = parseManifest(readRegularFile(jsonPath, "final JSON SRI manifest"), "final JSON SRI manifest");
  const writtenJavascript = readRegularFile(javascriptPath, "final JavaScript SRI manifest").toString("utf8");
  if (writtenJavascript !== serializeManifest(writtenManifest).javascript) {
    fail("final companion JavaScript manifest does not match the JSON manifest");
  }
  if (writtenManifest[manifestRelativePath] !== sha256Integrity(readRegularFile(ssgManifestPath, "final SSG manifest"))) {
    fail("final SSG manifest digest did not persist");
  }

  return { manifestRelativePath, integrity: writtenManifest[manifestRelativePath] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = finalizeSRIManifest();
  console.log(`Finalized SHA-256 SRI for ${result.manifestRelativePath}.`);
}
