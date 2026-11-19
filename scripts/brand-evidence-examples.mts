import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collectBrandKitDraft, brandDraftHtmlText } from "../src/lib/campaign-lab/brand-import/brand-evidence.ts";
import { syntheticCases } from "../tests/fixtures/brand-evidence/synthetic.ts";

const root = new URL("../docs/examples/brand-evidence/", import.meta.url);
await mkdir(root, { recursive: true });
for (const [name, resources] of Object.entries(await syntheticCases())) {
  const directory = new URL(`${name}/`, root);
  await mkdir(directory, { recursive: true });
  const index = [];
  for (const [i, r] of resources.entries()) {
    const path = `source-${i}.${r.kind === "raster" ? "bin" : r.kind}`;
    await writeFile(new URL(path, directory), r.body);
    const { body: _body, ...metadata } = r;
    void _body;
    index.push({ ...metadata, bodyFile: path });
  }
  const draft = await collectBrandKitDraft(resources);
  await writeFile(new URL("resources.json", directory), JSON.stringify(index, null, 2) + "\n");
  await writeFile(new URL("draft.json", directory), JSON.stringify(draft, null, 2) + "\n");
  await writeFile(new URL("report.html", directory), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'"><title>Synthetic evidence draft</title><pre>${brandDraftHtmlText(draft)}</pre>\n`);
  console.log(`${name}: ${draft.outcome}, ${draft.candidates.length} candidates, ${draft.sources.length} sources`);
}
console.log(`Examples: ${fileURLToPath(root)}`);
