import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { importBrandDraft } from "../src/lib/campaign-lab/brand-import/import-brand.ts";
import { offlineFixture, response } from "./fixtures/brand-import/offline.ts";

test("healthy HTML/CSS/raster completes with warnings separate from failures and approvals false", async () => {
  const png=await sharp({create:{width:8,height:8,channels:3,background:"#123456"}}).png().toBuffer();
  const f=offlineFixture([response('<style>body{color:#123456}</style><link rel="stylesheet" href="x.css"><img src="x.png">'),response("body{background:#ffffff}","text/css"),response(png,"image/png")]);
  const r=await importBrandDraft("https://synthetic.example/start",f.read);
  assert.equal(r.ledger.version,"ornigami-brand-import/1.1.0");
  assert.equal(r.ledger.status,"complete"); assert.deepEqual(r.ledger.extractionFailures,[]);
  assert(r.ledger.evidenceWarnings!.some(s=>s.issues.includes("image-purpose-and-rights-unknown")));
  assert(Object.values(r.draft!.approvals).every(v=>v===false)); assert.deepEqual(r.draft!.acceptedValues,[]);
});
test("unsupported, corrupt, missing and unresolved resources remain partial", async () => {
  for (const asset of [response("<svg/>","image/svg+xml"),response(Buffer.from([137,80,78,71,13,10,26,10]),"image/png"),response("missing","text/plain",404)]) {
    const f=offlineFixture([response('<style>body{color:#123456}</style><img src="x.png">'),asset]);
    const r=await importBrandDraft("https://synthetic.example/start",f.read); assert.equal(r.ledger.status,"partial");
    assert(r.ledger.extractionFailures.length || r.ledger.entries.some(e=>e.error));
  }
});
