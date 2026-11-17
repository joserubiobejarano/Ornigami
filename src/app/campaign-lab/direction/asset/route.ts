import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";

export const dynamic = "force-dynamic";

const LOCAL_ROOT = join(process.cwd(), ".local", "momisa-direction");
const BRIEF_PATH = join(LOCAL_ROOT, "approved-brief.json");
const ASSET_PATH = join(LOCAL_ROOT, "inputs", "Box.jpg");

/**
 * Development-only bytes for the approved Momisa packshot. The source image
 * and its expected hash stay in Git-ignored storage; this route refuses to
 * serve a file that does not match the approved local brief.
 */
export async function GET() {
  if (!isCampaignLabAvailable()) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const brief = JSON.parse(await readFile(BRIEF_PATH, "utf8")) as {
      asset?: { sha256?: unknown };
    };
    const expected = brief.asset?.sha256;
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/i.test(expected)) {
      return new Response("Approved packshot hash is not available", {
        status: 500,
      });
    }

    const bytes = await readFile(ASSET_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== expected.toLowerCase()) {
      return new Response("Approved packshot hash mismatch", { status: 500 });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Approved packshot is not available", { status: 404 });
  }
}
