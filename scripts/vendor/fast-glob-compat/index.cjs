"use strict";

// The pinned Next and TypeScript-ESTree consumers expect this CommonJS package shape.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- required by those CommonJS-only consumers
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- required by those CommonJS-only consumers
const { globSync } = require("tinyglobby");

const ALLOWED_OPTIONS = new Set(["cwd", "ignore", "onlyDirectories"]);

function normalizeIgnore(ignore) {
  if (ignore === undefined) return undefined;
  if (!Array.isArray(ignore) || ignore.some((pattern) => typeof pattern !== "string")) {
    throw new TypeError("fast-glob compatibility adapter expects ignore to be a string array");
  }
  return ignore.map((pattern) => {
    if (pattern.startsWith("!(")) return pattern;
    if (pattern.startsWith("!")) return pattern.slice(1);
    return pattern;
  });
}

function isAbsolutePattern(pattern) {
  return path.isAbsolute(pattern) || /^[A-Za-z]:\//.test(pattern) || pattern.startsWith("//");
}

function trimDirectorySlash(match) {
  const normalized = match.replace(/\\/g, "/");
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized) || /^\/\/[^/]+\/[^/]+\/$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

function run(pattern, options = {}) {
  if (typeof pattern !== "string") {
    throw new TypeError("fast-glob compatibility adapter supports one string pattern per call");
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("fast-glob compatibility adapter expects an options object");
  }
  for (const option of Object.keys(options)) {
    if (!ALLOWED_OPTIONS.has(option)) throw new TypeError(`Unsupported fast-glob option: ${option}`);
  }
  if (options.cwd !== undefined && typeof options.cwd !== "string") {
    throw new TypeError("fast-glob compatibility adapter expects cwd to be a string");
  }
  if (options.onlyDirectories !== undefined && typeof options.onlyDirectories !== "boolean") {
    throw new TypeError("fast-glob compatibility adapter expects onlyDirectories to be a boolean");
  }

  const absolute = isAbsolutePattern(pattern);
  const matches = globSync(pattern, {
    absolute,
    cwd: options.cwd,
    expandDirectories: false,
    ignore: normalizeIgnore(options.ignore),
    onlyDirectories: options.onlyDirectories,
  });
  return options.onlyDirectories ? matches.map(trimDirectorySlash) : matches;
}

module.exports = { sync: run, globSync: run };
