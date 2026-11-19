import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { setImmediate as turn } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { importBrandDraft, BRAND_IMPORT_LIMITS } from "../src/lib/campaign-lab/brand-import/import-brand.ts";
import { discoverHtmlResources } from "../src/lib/campaign-lab/brand-import/html-discovery.ts";
import { collectBrandKitDraft } from "../src/lib/campaign-lab/brand-import/brand-evidence.ts";
import type { EvidenceSource, SuppliedBrandResource } from "../src/lib/campaign-lab/brand-import/evidence-types.ts";
import { offlineFixture, exampleFixture, response, redirect, sequencedClock } from "./fixtures/brand-import/offline.ts";

const seed = "https://synthetic.example/start";
const useful = '<meta name="theme-color" content="#123456"><p>Fictional paper.</p>';
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function cleanup(f: ReturnType<typeof offlineFixture>, signal?: AbortSignal) {
  await turn();
  assert(f.sockets.every(s => s.destroyed));
  for (const s of f.signals) assert.equal(getEventListeners(s, "abort").length, 0);
  if (signal) assert.equal(getEventListeners(signal, "abort").length, 0);
}

test("complete protected-reader pipeline: redirected base, exact hashes/quotes, forbidden CDN stays partial", async () => {
  const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ff0080" } }).png().toBuffer();
  const f = exampleFixture(photo);
  const result = await importBrandDraft(seed, f.read);
  assert.equal(result.ledger.status, "partial");
  assert.equal(result.ledger.entries.at(-1)?.error, "BLOCKED_DESTINATION");
  assert.equal(f.sockets.length, 4); // Seed redirect, homepage, CSS, raster; never CDN.
  assert(f.addresses.every(a => a === "93.184.216.34"));
  assert.match(f.sockets[2].wire, /^GET \/brand\/theme.png /);
  assert.match(f.sockets[3].wire, /^GET \/brand\/photo.css /);
  assert.equal(result.draft?.sources[0].requestedUrl, seed);
  assert.equal(result.draft?.sources[0].finalUrl, "https://synthetic.example/brand/home");
  assert.deepEqual(result.draft, await collectBrandKitDraft(result.resources).then(d => {
    d.gaps.push("Import evidence is incomplete: inspect the bounded import ledger for missing resources and failures."); return d;
  }));
  for (const c of result.draft!.candidates) {
    const source: EvidenceSource = result.draft!.sources.find(s => s.id === c.sourceId)!;
    const resource: SuppliedBrandResource = result.resources.find(r => hash(r.body) === source.sha256)!;
    assert.equal(c.sourceSha256, hash(resource.body));
    if (c.evidence.utf16Offset !== null) {
      assert.equal(new TextDecoder().decode(resource.body).slice(c.evidence.utf16Offset, c.evidence.utf16Offset + c.evidence.quote.length), c.evidence.quote);
    }
  }
  assert.deepEqual(result.draft!.acceptedValues, []);
  assert(Object.values(result.draft!.approvals).every(v => v === false));
  assert.equal(result.ledger.maxHttpAttempts, 36);
  assert.equal(result.ledger.logicalReads, 4);
  assert.equal(result.ledger.retainedBytes, result.resources.reduce((n, r) => n + r.body.length, 0));
  assert(!result.draft!.candidates.some(c => c.observed.includes("ignored.")));
  await cleanup(f);
});

test("discovery uses exact rel tokens, final base, inert exclusions, deduplication and bounded tag enumeration", () => {
  const html = `<base href="https://wrong.example"><img srcset="x 1x" src="a#x"><img src="a#y">
  <link rel="notstylesheet" href="bad"><link rel="iconic" href="bad2"><link rel="alternate STYLESHEET" href="ok&amp;x">
  <link rel="preload" as="font" href="font"><source src="unsupported"><a href="crawl">link</a>
  <style>x { content: '<img src="bad3">' }</style><textarea><img src="bad4"></textarea>
  <script><img src="bad5"></script><template><img src="bad6"></template>`;
  const d = discoverHtmlResources(html, "https://synthetic.example/final/home", 256);
  assert.deepEqual(d.resources, [{ kind: "raster", url: "https://synthetic.example/final/a" }, { kind: "css", url: "https://synthetic.example/final/ok&x" }]);
  for (const issue of ["BASE_IGNORED", "SRCSET_IGNORED", "DUPLICATE_REFERENCE"]) assert(d.issues.includes(issue));
  const capped = discoverHtmlResources('<img src="a">'.repeat(2000), seed, 12);
  assert.equal(capped.tags, 12); assert.equal(capped.resources.length, 1); assert(capped.issues.includes("DISCOVERY_LIMIT"));
});

test("logical resource, tag and raster limits bound all scheduled work including duplicate fragments", async () => {
  const html = useful + Array.from({ length: 30 }, (_, i) => `<link rel="stylesheet" href="${i}#a"><link rel="stylesheet" href="${i}#b">`).join("");
  const f = offlineFixture([response(html), ...Array.from({ length: 12 }, () => response("body { color: #111 }", "text/css"))]);
  const r = await importBrandDraft(seed, f.read, { limits: { resources: 3 } });
  assert.equal(f.sockets.length, 3); assert.equal(r.ledger.logicalReads, 3);
  assert.equal(r.ledger.scheduledHttpAttemptBound, 9);
  assert(r.ledger.issues.includes("RESOURCE_LIMIT")); await cleanup(f);
  const raster = offlineFixture([response(useful + Array.from({ length: 9 }, (_, i) => `<img src="${i}">`).join("")), response("bad", "image/png")]);
  const limited = await importBrandDraft(seed, raster.read, { limits: { rasters: 1, tags: 6 } });
  assert.equal(raster.sockets.length, 2); assert(limited.ledger.issues.includes("RASTER_LIMIT"));
  assert(limited.ledger.issues.includes("DISCOVERY_LIMIT")); await cleanup(raster);
});

test("aggregate bytes reserve failed reads and stop scheduling at exhaustion", async () => {
  const html = useful + '<link rel="stylesheet" href="large"><img src="never">';
  const f = offlineFixture([response(html), response("x".repeat(100), "text/css")]);
  const r = await importBrandDraft(seed, f.read, { limits: { totalBytes: Buffer.byteLength(html) + 10 } });
  assert.equal(r.ledger.entries[1].error, "TOO_LARGE");
  assert.equal(r.ledger.chargedBytes, r.ledger.limits.totalBytes);
  assert.equal(r.ledger.retainedBytes, Buffer.byteLength(html));
  assert(r.ledger.issues.includes("BYTE_BUDGET")); assert.equal(f.sockets.length, 2);
  assert.equal(r.draft!.outcome, "draft"); assert.equal(r.ledger.status, "partial"); await cleanup(f);
});

test("successful byte exhaustion and CSS parser failure preserve exact seed evidence", async () => {
  const html = useful + '<link rel="stylesheet" href="first"><link rel="stylesheet" href="never">';
  const css = "body { color: #111 }";
  const f = offlineFixture([response(html), response(css, "text/css")]);
  const r = await importBrandDraft(seed, f.read, { limits: { totalBytes: Buffer.byteLength(html + css) } });
  assert.equal(r.ledger.chargedBytes, Buffer.byteLength(html + css));
  assert.equal(r.ledger.retainedBytes, r.ledger.chargedBytes);
  assert(r.ledger.issues.includes("BYTE_BUDGET")); assert.equal(f.sockets.length, 2); await cleanup(f);
  const failure = offlineFixture([response(useful + '<link rel="stylesheet" href="broken">'), Buffer.from("not HTTP\r\n\r\n")]);
  const partial = await importBrandDraft(seed, failure.read);
  assert.equal(partial.ledger.entries[1].kind, "css"); assert.equal(partial.ledger.entries[1].error, "NETWORK_FAILED");
  assert.equal(partial.ledger.status, "partial"); assert.equal(partial.draft!.sources.length, 1);
  assert.equal(partial.draft!.sources[0].sha256, hash(partial.resources[0].body)); await cleanup(failure);
});

test("usable HTML and supported stylesheet complete without approvals or recursive CSS reads", async () => {
  const f = offlineFixture([response(useful + '<link rel="stylesheet" href="theme">'),
    response("@import 'more.css'; @font-face { src: url(font.woff2) } body { color: #111 }", "text/css")]);
  const r = await importBrandDraft(seed, f.read);
  assert.equal(r.ledger.status, "complete"); assert.equal(r.draft!.outcome, "draft");
  assert.equal(f.sockets.length, 2); assert.equal(r.ledger.entries.length, 2);
  assert(r.draft!.candidates.some(c => c.method === "css-reference" && c.observed.endsWith("font.woff2")));
  assert(Object.values(r.draft!.approvals).every(v => v === false)); await cleanup(f);
});

test("per-resource HTML size and seed status/type/encoding/UTF8 failures never become success", async () => {
  for (const wire of [response("x".repeat(512 * 1024 + 1)), response(useful, "text/html", 404),
    response(useful, "image/png"), response(useful, "text/html; charset=latin1"), response(Buffer.from([255]), "text/html"),
    response(useful, "text/html", 200, "Content-Encoding: gzip\r\n")]) {
    const f = offlineFixture([wire]); const r = await importBrandDraft(seed, f.read);
    assert.equal(r.ledger.status, "rejected");
    assert(!r.draft || r.draft.candidates.length === 0); assert.equal(f.sockets.length, 1); await cleanup(f);
  }
});

test("optional CSS/HTTP/compression failures and corrupt/oversized/unsupported raster retain useful HTML", async () => {
  const oversized = await sharp({ create: { width: 2001, height: 2000, channels: 3, background: "white" } }).png().toBuffer();
  for (const optional of [response("missing", "text/css", 404), response("", "text/css", 200, "Content-Encoding: br\r\n"),
    response("body { color: #fff }", "image/png"), response("corrupt", "image/png"), response(oversized, "image/png"),
    response("<svg/>", "image/svg+xml"), response("x".repeat(512 * 1024 + 1), "image/png")]) {
    const f = offlineFixture([response(useful + '<img src="optional.css" type="text/css">'), optional]);
    const r = await importBrandDraft(seed, f.read);
    assert.equal(r.ledger.status, "partial"); assert.equal(r.draft!.outcome, "draft");
    assert(r.ledger.entries[1].error || r.draft!.sources[1].issues.length);
    assert.equal(r.draft!.candidates.filter(c => c.category === "ui-color").length, 1);
    assert(Object.values(r.draft!.approvals).every(v => v === false)); await cleanup(f);
  }
});

test("shared deadline covers redirect expansion and subsequent reads without resetting allowance", async () => {
  const time = sequencedClock();
  const f = offlineFixture([redirect("/final"), response(useful + '<link rel="stylesheet" href="x"><img src="never">'), redirect("/late")], {
    clock: time.clock, onWrite: (_s, index) => time.advance(index === 2 ? 40 : 30),
  });
  const allowances: number[] = [];
  const r = await importBrandDraft(seed, (url, o) => { allowances.push(o.timeoutMs!); return f.read(url, o); }, { clock: time.clock, limits: { networkMs: 100 } });
  assert.deepEqual(allowances, [100, 40]); assert.equal(r.ledger.cancellation, "DEADLINE");
  assert.equal(r.ledger.status, "cancelled"); assert.equal(r.draft, null);
  assert.equal(f.sockets.length, 3); assert.equal(time.timers.size, 0); await cleanup(f);
});

test("global cancellation races offline DNS; late DNS cannot start a socket", async () => {
  const controller = new AbortController();
  let finish!: (value: { address: string; family: number }[]) => void;
  let entered!: () => void; const ready = new Promise<void>(r => { entered = r; });
  const f = offlineFixture([response(useful)], { resolve: async () => { entered(); return new Promise(r => { finish = r; }); } });
  const pending = importBrandDraft(seed, f.read, { signal: controller.signal });
  await ready; controller.abort("secret"); const r = await pending;
  finish([{ address: "93.184.216.34", family: 4 }]); await turn();
  assert.equal(r.draft, null); assert.equal(r.ledger.cancellation, "CANCELLED");
  assert.equal(f.sockets.length, 0); assert(!JSON.stringify(r.ledger).includes("secret")); await cleanup(f, controller.signal);
});

test("shared deadline cancels stalled DNS independently of the per-read timer", async () => {
  const time = sequencedClock();
  let entered!: () => void; const ready = new Promise<void>(r => { entered = r; });
  let finish!: (value: { address: string; family: number }[]) => void;
  const f = offlineFixture([], { clock: time.clock, resolve: async () => {
    entered(); return new Promise(r => { finish = r; });
  } });
  const pending = importBrandDraft(seed, f.read, { clock: time.clock, limits: { networkMs: 100 } });
  await ready; time.advance(100); const r = await pending;
  finish([{ address: "93.184.216.34", family: 4 }]);
  assert.equal(r.ledger.cancellation, "DEADLINE"); assert.equal(r.draft, null);
  assert.equal(f.sockets.length, 0); assert.equal(time.timers.size, 0); await cleanup(f);
});

test("absolute shared deadline prevents a new socket before delayed timer callbacks", async () => {
  const time = sequencedClock();
  const f = offlineFixture([response(useful)], { clock: time.clock, resolve: async () => {
    // Advance clock reads without firing scheduled callbacks, simulating starvation.
    time.clock.now = () => 100;
    return [{ address: "93.184.216.34", family: 4 }];
  } });
  const r = await importBrandDraft(seed, f.read, { clock: time.clock, limits: { networkMs: 100 } });
  assert.equal(r.ledger.cancellation, "DEADLINE"); assert.equal(f.sockets.length, 0);
  assert.equal(time.timers.size, 0); await cleanup(f);
});

test("global body cancellation destroys streams; late body cannot publish or discover resources", async () => {
  const controller = new AbortController();
  const f = offlineFixture([null], { onWrite: socket => {
    socket.push(Buffer.from("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n"));
    queueMicrotask(() => controller.abort());
  } });
  const r = await importBrandDraft(seed, f.read, { signal: controller.signal });
  f.sockets[0].push(Buffer.from("0\r\n\r\n"));
  assert.equal(r.draft, null); assert.equal(r.ledger.status, "cancelled"); assert.equal(f.sockets.length, 1);
  await cleanup(f, controller.signal);
});

test("expiry between seed collection and discovery stops scheduling, even with a delayed timer callback", async () => {
  const time = sequencedClock(); let seedReturned = false; let checks = 0;
  const clock = { ...time.clock, now: () => seedReturned && ++checks >= 2 ? 100 : 0 };
  const f = offlineFixture([response(useful + '<link rel="stylesheet" href="never">')], { clock });
  const r = await importBrandDraft(seed, async (url, o) => { const value = await f.read(url, o); seedReturned = true; return value; }, { clock, limits: { networkMs: 100 } });
  assert.equal(r.ledger.cancellation, "DEADLINE"); assert.equal(r.draft, null); assert.equal(f.sockets.length, 1);
  assert.equal(r.ledger.discoveryTags, 0); assert.equal(time.timers.size, 0); await cleanup(f);
});

test("pre-cancellation and invalid input/configuration perform no network work", async () => {
  const controller = new AbortController(); controller.abort(); const f = offlineFixture([]);
  const r = await importBrandDraft(seed, f.read, { signal: controller.signal });
  assert.equal(r.ledger.status, "cancelled");
  for (const url of ["javascript:alert(1)", "https://user:secret@synthetic.example", "x".repeat(3000)]) {
    assert.equal((await importBrandDraft(url, f.read)).ledger.status, "rejected");
  }
  await assert.rejects(importBrandDraft(seed, f.read, { limits: { resources: 13 } }), TypeError);
  assert.equal(f.hosts.length, 0); await cleanup(f, controller.signal);
});

test("JS-only and empty HTML yield incomplete evidence without defaults or script execution", async () => {
  for (const html of ["", '<div id="root"></div><script>throw new Error("executed");</script>']) {
    const f = offlineFixture([response(html)]); const r = await importBrandDraft(seed, f.read);
    assert.equal(r.ledger.status, "incomplete"); assert.equal(r.draft!.outcome, "incomplete");
    assert.deepEqual(r.draft!.candidates, []); assert.deepEqual(r.draft!.acceptedValues, []);
    assert(Object.values(r.draft!.approvals).every(v => v === false)); await cleanup(f);
  }
});

test("redirect cap bounds wire expansion independently from logical read count", async () => {
  const f = offlineFixture([redirect("/one"), redirect("/two"), redirect("/three")]);
  const r = await importBrandDraft(seed, f.read);
  assert.equal(r.ledger.logicalReads, 1); assert.equal(f.sockets.length, 3);
  assert.equal(r.ledger.entries[0].error, "REDIRECT_LIMIT"); assert.equal(r.ledger.status, "rejected");
  assert.equal(r.ledger.scheduledHttpAttemptBound, 3); assert.equal(BRAND_IMPORT_LIMITS.redirects, 2); await cleanup(f);
});

test("saved integrated example replays from exact source bytes", async () => {
  const directory = new URL("../docs/examples/brand-import/partial/", import.meta.url);
  const metadata = JSON.parse(await readFile(new URL("resources.json", directory), "utf8"));
  const resources = await Promise.all(metadata.map(async ({ bodyFile, ...r }: { bodyFile: string }) => ({ ...r, body: await readFile(new URL(bodyFile, directory)) })));
  const expected = JSON.parse(await readFile(new URL("draft.json", directory), "utf8"));
  const draft = await collectBrandKitDraft(resources);
  draft.gaps.push("Import evidence is incomplete: inspect the bounded import ledger for missing resources and failures.");
  assert.deepEqual(draft, expected);
  const ledger = JSON.parse(await readFile(new URL("ledger.json", directory), "utf8"));
  assert.equal(ledger.status, "partial"); assert.equal(ledger.entries.at(-1).error, "BLOCKED_DESTINATION");
  for (const r of resources) assert(ledger.entries.some((e: { sha256: string }) => e.sha256 === hash(r.body)));
});
