import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const appDir = join(appRoot, ".next", "server", "app");
const outputFile = join(appRoot, ".next", "static-csp-hashes.json");
const hashes = new Set();

function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = readFileSync(path, "utf8");
      const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
      for (const match of html.matchAll(scriptPattern)) {
        if (!match[1]) continue;
        hashes.add(createHash("sha256").update(match[1], "utf8").digest("base64"));
      }
    }
  }
}

walk(appDir);
writeFileSync(outputFile, `${JSON.stringify([...hashes].sort(), null, 2)}\n`, "utf8");
console.log(`Generated ${hashes.size} static CSP script hashes.`);
