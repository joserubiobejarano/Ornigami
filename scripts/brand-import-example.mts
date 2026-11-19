import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { importBrandDraft } from "../src/lib/campaign-lab/brand-import/import-brand.ts";
import { brandDraftHtmlText } from "../src/lib/campaign-lab/brand-import/brand-evidence.ts";
import { exampleFixture } from "../tests/fixtures/brand-import/offline.ts";

// Fixed synthetic fixture only. No command-line URL, production DNS or live socket.
const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ff0080" } }).png().toBuffer();
const fixture = exampleFixture(photo);
const { draft, ledger, resources } = await importBrandDraft("https://synthetic.example/start", fixture.read);
if (!draft || ledger.status !== "partial") throw new Error("Offline example did not produce expected partial evidence");
const directory = new URL("../docs/examples/brand-import/partial/", import.meta.url);
await mkdir(directory, { recursive: true });
const metadata = [];
for (const [i, { body, ...resource }] of resources.entries()) {
  const bodyFile = `source-${i}.${resource.kind === "raster" ? "bin" : resource.kind}`;
  await writeFile(new URL(bodyFile, directory), body);
  metadata.push({ ...resource, bodyFile });
}
await writeFile(new URL("resources.json", directory), JSON.stringify(metadata, null, 2) + "\n");
await writeFile(new URL("draft.json", directory), JSON.stringify(draft, null, 2) + "\n");
await writeFile(new URL("ledger.json", directory), JSON.stringify(ledger, null, 2) + "\n");
await writeFile(new URL("report.html", directory), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'"><title>Synthetic partial brand draft</title><pre>${brandDraftHtmlText(draft)}</pre>`);
console.log(JSON.stringify({ status: ledger.status, logicalReads: ledger.logicalReads, fixtureHttpAttempts: fixture.sockets.length,
  maxHttpAttempts: ledger.maxHttpAttempts, bytes: ledger.retainedBytes, directory: directory.pathname }));
