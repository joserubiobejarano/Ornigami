import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { MomisaDirectionInput } from "./momisa-direction.ts";

const LOCAL_ROOT = join(process.cwd(), ".local", "momisa-direction");
const INPUT_PATH = join(LOCAL_ROOT, "approved-brief.json");
const ASSET_PATH = join(LOCAL_ROOT, "inputs", "Box.jpg");

/**
 * Reads the approved local brief and verifies the packshot bytes before any
 * experiment page renders. Everything stays in Git-ignored `.local/` storage.
 */
export async function loadMomisaDirectionInput(): Promise<MomisaDirectionInput | null> {
  try {
    const raw = await readFile(INPUT_PATH, "utf8");
    const parsed = JSON.parse(raw) as MomisaDirectionInput;
    if (parsed.schemaVersion !== 1) return null;
    if (
      !parsed.productName?.trim() ||
      !parsed.offer?.trim() ||
      !parsed.destinationUrl?.trim() ||
      !parsed.asset?.sha256?.trim() ||
      !Array.isArray(parsed.facts) ||
      parsed.facts.length === 0
    ) {
      return null;
    }

    const bytes = await readFile(ASSET_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== parsed.asset.sha256) return null;

    return parsed;
  } catch {
    return null;
  }
}
