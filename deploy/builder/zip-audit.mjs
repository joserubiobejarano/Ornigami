/**
 * Archive audit for the builder ZIP qualification.
 *
 * The archive is structurally validated with Python's zipfile before anything
 * is extracted. The tool must be able to verify CRC, enumerate every entry,
 * detect duplicate/case-duplicate names and reject unsafe paths. If Python 3
 * with zipfile is unavailable, qualification fails rather than falling back to
 * a weaker tool.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const PYTHON_PROBE =
  "import sys; assert sys.version_info[0] == 3; import zipfile; print('ok')";

const PYTHON_VALIDATE = String.raw`
import json, posixpath, sys, zipfile

path = sys.argv[1]
try:
    archive = zipfile.ZipFile(path)
except Exception as error:
    print(json.dumps({"toolError": "cannot open archive: %s" % error}))
    sys.exit(0)

infos = archive.infolist()
names = [info.filename for info in infos]
duplicates = sorted({name for name in names if names.count(name) > 1})
folded = {}
for name in names:
    folded.setdefault(name.casefold(), []).append(name)
case_duplicates = [sorted(values) for values in folded.values() if len(values) > 1]
unsafe = []
for info in infos:
    name = info.filename
    reason = None
    mode = (info.external_attr >> 16) & 0xFFFF
    file_type = mode & 0o170000
    if not name:
        reason = "empty"
    elif "\x00" in name:
        reason = "nul"
    elif any(ord(character) < 32 for character in name):
        reason = "control_character"
    elif "\\" in name:
        reason = "backslash"
    elif name.startswith("/"):
        reason = "absolute"
    elif len(name) >= 2 and name[1] == ":" and name[0].isalpha():
        reason = "drive"
    elif info.is_dir() or name.endswith("/"):
        reason = "directory"
    elif file_type == 0o120000:
        reason = "symlink"
    elif file_type not in (0, 0o100000, 0o040000):
        reason = "special_file"
    else:
        parts = name.split("/")
        if any(part in ("", ".", "..") for part in parts):
            reason = "unsafe_segment"
        elif posixpath.normpath(name) != name:
            reason = "non_canonical"
    if reason:
        unsafe.append({"name": name, "reason": reason})

try:
    crc_bad = archive.testzip()
except Exception as error:
    print(json.dumps({"toolError": "CRC verification is unavailable: %s" % error}))
    sys.exit(0)

print(json.dumps({
    "entries": len(infos),
    "names": names,
    "duplicates": duplicates,
    "caseDuplicates": case_duplicates,
    "unsafe": unsafe,
    "crcBad": crc_bad,
    "sizes": {
        info.filename: {
            "fileSize": info.file_size,
            "compressSize": info.compress_size,
            "crc": info.CRC,
        }
        for info in infos
    },
}))
`;

export class ZipAuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipAuditError";
  }
}

export class ZipAuditToolError extends ZipAuditError {
  constructor(message) {
    super(message);
    this.name = "ZipAuditToolError";
  }
}

function candidates(value) {
  return Array.isArray(value) && value.length > 0
    ? value
    : ["python3", "python"];
}

export function findZipAuditPython(pythonCandidates) {
  for (const command of candidates(pythonCandidates)) {
    const probe = spawnSync(command, ["-c", PYTHON_PROBE], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (probe.status === 0 && probe.stdout.trim() === "ok") return command;
  }
  return null;
}

export function validateZipArchive(zipPath, options = {}) {
  const python = findZipAuditPython(options.pythonCandidates);
  if (!python) {
    throw new ZipAuditToolError(
      "ZIP audit requires Python 3 with the zipfile module (python3 or python). " +
        "Install it or fail qualification; a weaker tool cannot prove CRC, unique paths and sizes.",
    );
  }
  const result = spawnSync(python, ["-c", PYTHON_VALIDATE, zipPath], {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new ZipAuditToolError(
      `ZIP audit tool could not validate ${zipPath}: ${
        result.error?.message ?? (result.stderr || result.stdout)
      }`,
    );
  }
  const lastLine = result.stdout.trim().split(/\r?\n/).at(-1) ?? "";
  let report;
  try {
    report = JSON.parse(lastLine);
  } catch {
    throw new ZipAuditToolError(
      `ZIP audit tool returned unreadable evidence: ${result.stdout}`,
    );
  }
  if (report.toolError) {
    throw new ZipAuditToolError(report.toolError);
  }
  if (!Number.isInteger(report.entries) || report.entries < 1) {
    throw new ZipAuditError("ZIP is empty or has no readable entries.");
  }
  if (report.duplicates.length > 0) {
    throw new ZipAuditError(
      `ZIP has duplicate entries: ${report.duplicates.join(", ")}`,
    );
  }
  if (report.caseDuplicates.length > 0) {
    throw new ZipAuditError(
      `ZIP has case-colliding entries: ${report.caseDuplicates
        .map((group) => group.join("/"))
        .join(", ")}`,
    );
  }
  if (report.unsafe.length > 0) {
    throw new ZipAuditError(
      `ZIP has unsafe entries: ${report.unsafe
        .map((entry) => `${entry.name} (${entry.reason})`)
        .join(", ")}`,
    );
  }
  if (report.crcBad !== null) {
    throw new ZipAuditError(`ZIP CRC check failed for ${report.crcBad}`);
  }
  return { ...report, python };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeLocalPath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return false;
  }
  return path.posix.normalize(value) === value;
}

function normalizedReference(value) {
  return typeof value === "string" ? value.replace(/^\.\/+/, "") : value;
}

function metaContent(html, name) {
  const pattern = new RegExp(
    `<meta[^>]+name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = pattern.exec(html);
  return match ? decodeHtml(match[1]) : null;
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function assertSafe(value, label) {
  if (!safeLocalPath(value)) {
    throw new ZipAuditError(`${label} has an unsafe path: ${JSON.stringify(value)}`);
  }
}

function requireFile(declared, value, label) {
  if (typeof value !== "string" || !declared.has(value)) {
    throw new ZipAuditError(
      `${label} references a file that is not in receipt.files: ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Validate the archive, then extract and prove the receipt inventory and
 * asset/revision agreement. Throws ZipAuditError/ZipAuditToolError on failure.
 */
export function auditZipBundle({
  zipPath,
  extractDir: publishDir,
  pythonCandidates = undefined,
}) {
  const validation = validateZipArchive(zipPath, { pythonCandidates });

  if (existsSync(publishDir)) {
    throw new ZipAuditError(
      `refusing to publish over pre-existing extracted output: ${publishDir}`,
    );
  }
  mkdirSync(path.dirname(publishDir), { recursive: true });
  const tempDir = mkdtempSync(path.join(path.dirname(publishDir), ".zip-audit-"));
  try {
    const extracted = spawnSync(
      validation.python,
      ["-m", "zipfile", "-e", zipPath, tempDir],
      { encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
    );
    if (extracted.error || extracted.status !== 0) {
      throw new ZipAuditError(
        `ZIP extraction failed: ${
          extracted.error?.message ?? (extracted.stderr || extracted.stdout)
        }`,
      );
    }

    const receiptPath = path.join(tempDir, "receipt.json");
  if (!existsSync(receiptPath)) {
    throw new ZipAuditError("ZIP is missing receipt.json");
  }
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    throw new ZipAuditError(
      `receipt.json is not readable JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    receipt?.schemaVersion !== 1 ||
    receipt?.kind !== "campaign-lab-local-export" ||
    !Array.isArray(receipt.files) ||
    receipt.files.length === 0
  ) {
    throw new ZipAuditError("receipt.json has an unsupported shape or empty inventory");
  }

  const archiveNames = validation.names.filter((name) => name !== "receipt.json");
  if (!validation.names.includes("receipt.json")) {
    throw new ZipAuditError("ZIP inventory is missing the unique receipt.json entry");
  }
  const declared = new Map();
  for (const file of receipt.files) {
    if (!file || typeof file !== "object") {
      throw new ZipAuditError("receipt.files contains a non-object entry");
    }
    assertSafe(file.path, "receipt.files");
    if (file.path === "receipt.json") {
      throw new ZipAuditError("receipt.files must not include receipt.json");
    }
    if (declared.has(file.path)) {
      throw new ZipAuditError(`receipt.files repeats ${file.path}`);
    }
    if (!Number.isInteger(file.bytes) || file.bytes < 0) {
      throw new ZipAuditError(`receipt.files has an invalid byte length for ${file.path}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(file.sha256 ?? ""))) {
      throw new ZipAuditError(`receipt.files has an invalid SHA-256 for ${file.path}`);
    }
    const entry = validation.sizes[file.path];
    if (!entry) {
      throw new ZipAuditError(`receipt.files declares a missing archive entry: ${file.path}`);
    }
    if (entry.fileSize !== file.bytes) {
      throw new ZipAuditError(
        `receipt.files length mismatch for ${file.path}: archive ${entry.fileSize}, receipt ${file.bytes}`,
      );
    }
    const bytes = readFileSync(path.join(tempDir, file.path));
    if (bytes.length !== file.bytes) {
      throw new ZipAuditError(
        `extracted length mismatch for ${file.path}: ${bytes.length} !== ${file.bytes}`,
      );
    }
    const actualHash = sha256(bytes);
    if (actualHash !== String(file.sha256).toLowerCase()) {
      throw new ZipAuditError(
        `receipt.files hash mismatch for ${file.path}: ${actualHash} !== ${file.sha256}`,
      );
    }
    declared.set(file.path, file);
  }

  for (const name of archiveNames) {
    if (!declared.has(name)) {
      throw new ZipAuditError(`archive entry is missing from receipt.files: ${name}`);
    }
  }
  for (const name of declared.keys()) {
    if (!validation.names.includes(name)) {
      throw new ZipAuditError(`receipt.files entry is missing from the archive: ${name}`);
    }
  }

  const asset = receipt.asset;
  if (!asset || typeof asset !== "object") {
    throw new ZipAuditError("receipt.asset is missing");
  }
  assertSafe(asset.file, "receipt.asset.file");
  const assetFile = declared.get(asset.file);
  if (!assetFile) {
    throw new ZipAuditError(`receipt.asset.file is not in receipt.files: ${asset.file}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(asset.exportedSha256 ?? ""))) {
    throw new ZipAuditError("receipt.asset.exportedSha256 is not a SHA-256");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(asset.contentHash ?? ""))) {
    throw new ZipAuditError("receipt.asset.contentHash is not a SHA-256");
  }
  if (String(assetFile.sha256).toLowerCase() !== String(asset.exportedSha256).toLowerCase()) {
    throw new ZipAuditError("receipt.asset file hash does not match exportedSha256");
  }
  const assetBytes = readFileSync(path.join(tempDir, asset.file));
  if (sha256(assetBytes) !== String(asset.exportedSha256).toLowerCase()) {
    throw new ZipAuditError("packshot bytes do not match receipt.asset.exportedSha256");
  }

  for (const [index, extra] of (receipt.assets ?? []).entries()) {
    if (!extra || typeof extra !== "object") {
      throw new ZipAuditError(`receipt.assets[${index}] is not an object`);
    }
    assertSafe(extra.file, `receipt.assets[${index}].file`);
    const file = declared.get(extra.file);
    if (!file) {
      throw new ZipAuditError(
        `receipt.assets[${index}].file is not in receipt.files: ${extra.file}`,
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(String(extra.exportedSha256 ?? ""))) {
      throw new ZipAuditError(`receipt.assets[${index}].exportedSha256 is not a SHA-256`);
    }
    if (String(file.sha256).toLowerCase() !== String(extra.exportedSha256).toLowerCase()) {
      throw new ZipAuditError(
        `receipt.assets[${index}] file hash does not match exportedSha256`,
      );
    }
    const bytes = readFileSync(path.join(tempDir, extra.file));
    if (sha256(bytes) !== String(extra.exportedSha256).toLowerCase()) {
      throw new ZipAuditError(
        `receipt.assets[${index}] bytes do not match exportedSha256`,
      );
    }
    if (
      extra.contentHash !== undefined &&
      String(extra.contentHash).toLowerCase() !==
        String(extra.exportedSha256).toLowerCase()
    ) {
      throw new ZipAuditError(
        `receipt.assets[${index}] contentHash does not match exportedSha256`,
      );
    }
  }

  for (const [index, font] of (receipt.fonts ?? []).entries()) {
    if (!font || typeof font !== "object") {
      throw new ZipAuditError(`receipt.fonts[${index}] is not an object`);
    }
    if (font.licenseFile !== undefined) {
      requireFile(declared, normalizedReference(font.licenseFile), `receipt.fonts[${index}].licenseFile`);
    }
    for (const file of font.files ?? []) {
      requireFile(declared, normalizedReference(file), `receipt.fonts[${index}].files`);
    }
  }
  const references = receipt.references ?? {};
  for (const key of ["scripts", "stylesheets", "images", "fonts"]) {
    for (const value of references[key] ?? []) {
      requireFile(declared, normalizedReference(value), `receipt.references.${key}`);
    }
  }
  for (const value of references.cssUrls ?? []) {
    const normalized = normalizedReference(value);
    if (
      typeof normalized === "string" &&
      !/^(?:data:|https?:|#)/i.test(normalized)
    ) {
      requireFile(declared, normalized, "receipt.references.cssUrls");
    }
  }

  const html = readFileSync(path.join(tempDir, "index.html"), "utf8");
  const revision = metaContent(html, "campaign-lab-revision");
  const packshotHash = metaContent(html, "campaign-lab-packshot-sha256");
  const approvedRevision = receipt.approval?.revision;
  if (typeof approvedRevision !== "string" || approvedRevision.length === 0) {
    throw new ZipAuditError("receipt.approval.revision is missing");
  }
  if (receipt.approval?.renderedRevision !== approvedRevision) {
    throw new ZipAuditError("receipt approval and rendered revision disagree");
  }
  if (revision !== approvedRevision) {
    throw new ZipAuditError(
      `receipt approval revision disagrees with HTML: ${approvedRevision} !== ${revision}`,
    );
  }
  if (
    String(packshotHash ?? "").toLowerCase() !==
    String(asset.exportedSha256).toLowerCase()
  ) {
    throw new ZipAuditError(
      `packshot hash disagrees with HTML: ${asset.exportedSha256} !== ${packshotHash}`,
    );
  }
  const checkMeta = (metaName, value, label) => {
    if (value === undefined) return;
    if (metaContent(html, metaName) !== value) {
      throw new ZipAuditError(`${label} disagrees with HTML`);
    }
  };
  checkMeta("campaign-lab-offer", receipt.preview?.offer, "offer");
  checkMeta("campaign-lab-offer-price", receipt.preview?.offerPrice, "offer price");
  checkMeta("campaign-lab-destination", receipt.preview?.destinationUrl, "destination");
  checkMeta("campaign-lab-preview-status", receipt.preview?.status, "preview status");
  checkMeta(
    "campaign-lab-preview-notice",
    receipt.preview?.notice ?? null,
    "preview notice",
  );
  if (receipt.provenance?.assetIdentity) {
    const identity = receipt.provenance.assetIdentity;
    if (
      identity.exportedSha256 != null &&
      String(identity.exportedSha256).toLowerCase() !==
        String(asset.exportedSha256).toLowerCase()
    ) {
      throw new ZipAuditError("receipt provenance exported hash disagrees with asset");
    }
    if (
      identity.declaredSha256 != null &&
      String(identity.declaredSha256).toLowerCase() !==
        String(asset.contentHash).toLowerCase()
    ) {
      throw new ZipAuditError("receipt provenance declared hash disagrees with asset");
    }
  }

  if (existsSync(publishDir)) {
    throw new ZipAuditError(
      `refusing to publish over pre-existing extracted output: ${publishDir}`,
    );
  }
  renameSync(tempDir, publishDir);
  return {
    entries: validation.entries,
    names: validation.names,
    files: receipt.files.length,
    archiveFiles: archiveNames.length,
    receipt,
    asset,
    revision: approvedRevision,
    publishedDir: publishDir,
    python: validation.python,
  };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}
