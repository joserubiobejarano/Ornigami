import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_OFFER_SERVER_ASSET_SRC,
  browserOfferBriefFromIntake,
  parseBrowserOfferBriefRequest,
} from "../src/lib/campaign-lab/browser-offer-brief.ts";
import type { BrowserOfferBriefRequest } from "../src/lib/campaign-lab/browser-offer-brief.ts";
import {
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "../src/lib/campaign-lab/fixtures.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import { buildBrowserOfferCatalog } from "../src/lib/campaign-lab/browser-offer.ts";
import { LocalTestGenerationProvider } from "../src/lib/campaign-lab/generation/local-test-provider.ts";
import { parsePreparedOfferIntakeBrief, parsePersistedOfferIntakeBrief, serializePersistedOfferIntakeBrief } from "../src/lib/campaign-lab/offer-intake-brief.ts";
import type { CampaignFormValues } from "../src/lib/campaign-lab/types.ts";

function request(): BrowserOfferBriefRequest {
  return {
    schemaVersion: 1,
    brandName: "Harbor Field",
    productName: "Harbor Field travel bottle",
    audience: "People discovering the bottle in a paid social ad on mobile.",
    objective: "Send the visitor to the marketplace listing with the 20% offer clear.",
    offer: "20% off, 27-30 November 2026",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Capacity", value: "500 ml" },
      { label: "Closure", value: "Screw cap" },
    ],
    asset: {
      fileName: "bottle.png",
      width: 1200,
      height: 1500,
      alt: "Graphite travel bottle on a studio backdrop.",
      rights: "Synthetic local fixture.",
      contentHash: "a".repeat(64),
    },
    operatorConfirmations: {
      offer: "20% off, 27-30 November 2026",
      destination: "https://example.com/harbor-field",
      rights: "Synthetic local fixture.",
    },
    reviewedOn: "2026-11-18",
  };
}

test("a bounded browser brief constructs the app-owned generation context", () => {
  const parsed = parseBrowserOfferBriefRequest(request());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.input.audience, request().audience);
  assert.equal(parsed.input.objective, request().objective);
  assert.equal(parsed.input.packshot?.src, BROWSER_OFFER_SERVER_ASSET_SRC);
  assert.equal(parsed.context.ownerConfirmed, false);
  assert.equal(parsed.context.assetBytesVerified, false);
  assert.equal(parsed.context.operatorVerification.offer, "confirmed");
  assert.equal(parsed.context.operatorVerification.destination, "direct");
  assert.equal(parsed.context.operatorVerification.rights, "confirmed");
});

test("missing context remains compatible with older browser briefs", () => {
  const older = request();
  delete older.audience;
  delete older.objective;
  const parsed = parseBrowserOfferBriefRequest(older);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.input.audience, undefined);
    assert.equal(parsed.input.objective, undefined);
  }
});

test("malformed and overlong browser context returns actionable issues", () => {
  const wrongTypes = request();
  (wrongTypes as Record<string, unknown>).audience = 42;
  (wrongTypes as Record<string, unknown>).objective = { goal: "Synthetic" };
  const wrong = parseBrowserOfferBriefRequest(wrongTypes);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.match(wrong.issues.map((issue) => issue.message).join(" "), /Audience must be text/);
    assert.match(
      wrong.issues.map((issue) => issue.message).join(" "),
      /Campaign objective must be text/,
    );
  }

  const tooLong = request();
  tooLong.audience = "a".repeat(241);
  const rejected = parseBrowserOfferBriefRequest(tooLong);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.match(
      rejected.issues.map((issue) => issue.message).join(" "),
      /Audience must be 240 characters or fewer/,
    );
  }
});

test("the browser boundary rejects local sources, catalogs, and unknown fields", () => {
  const withSrc = request() as BrowserOfferBriefRequest & {
    asset: BrowserOfferBriefRequest["asset"] & { src: string };
  };
  withSrc.asset.src = "blob:http://localhost/local-packshot";
  const srcResult = parseBrowserOfferBriefRequest(withSrc);
  assert.equal(srcResult.ok, false);
  if (!srcResult.ok) {
    assert.match(srcResult.issues.map((issue) => issue.message).join(" "), /object URL stay in the browser/);
  }

  const withCatalog = {
    ...request(),
    catalog: { fixtures: { evil: {} } },
  };
  const catalogResult = parseBrowserOfferBriefRequest(withCatalog);
  assert.equal(catalogResult.ok, false);
  if (!catalogResult.ok) {
    assert.match(catalogResult.issues.map((issue) => issue.message).join(" "), /catalog is not supported/);
  }

  const withFixture = { ...request(), fixtureId: "unknown-fixture" };
  const fixtureResult = parseBrowserOfferBriefRequest(withFixture);
  assert.equal(fixtureResult.ok, false);
  if (!fixtureResult.ok) {
    assert.match(fixtureResult.issues.map((issue) => issue.message).join(" "), /fixtureId is not supported/);
  }
});

test("the client builder omits the packshot object URL and keeps metadata only", () => {
  const brief = browserOfferBriefFromIntake({
    brandName: "Harbor Field",
    productName: "Harbor Field travel bottle",
    audience: "Mobile shoppers.",
    objective: "Reach the listing.",
    offer: "20% off",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Capacity", value: "500 ml" },
      { label: "Closure", value: "Screw cap" },
    ],
    packshot: {
      src: "blob:http://localhost/local-packshot",
      width: 1200,
      height: 1500,
      alt: "Bottle.",
      rights: "Local only.",
      contentHash: "b".repeat(64),
      fileName: "bottle.png",
    },
    reviewedOn: "2026-11-18",
    confirmations: {
      offer: "20% off",
      destination: "https://example.com/harbor-field",
      rights: "Local only.",
    },
  });
  assert.equal("src" in brief.asset, false);
  assert.equal(brief.asset.fileName, "bottle.png");
  assert.equal(brief.operatorConfirmations?.offer, "20% off");
});

test("the direct service rejects malformed campaign context without throwing", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = {
    ...createFormValues(fixture),
    audience: 42,
    objective: { goal: "Synthetic" },
  } as unknown as CampaignFormValues;
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    { env: { CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test" } },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.issues.map((issue) => issue.field),
    ["audience", "objective"],
  );
  assert.match(result.issues[0].message, /Audience must be text/);
  assert.match(result.issues[1].message, /Campaign objective must be text/);
});
test("accent is a narrowly validated browser presentation choice", () => {
  const withAccent = { ...request(), accent: "#244FAE" };
  const parsed = parseBrowserOfferBriefRequest(withAccent);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.accent, "#244fae");
    assert.equal(parsed.context.source, "browser-offer");
  }

  for (const accent of ["blue", "#123", "#gggggg", 42, { value: "#244fae" }]) {
    const rejected = parseBrowserOfferBriefRequest({ ...request(), accent });
    assert.equal(rejected.ok, false, JSON.stringify(accent));
    if (!rejected.ok) {
      assert.ok(
        rejected.issues.some((issue) => issue.field === "accent"),
        JSON.stringify(accent),
      );
    }
  }

  const older = request();
  delete older.accent;
  assert.equal(parseBrowserOfferBriefRequest(older).ok, true);
});

test("the client builder carries the selected accent without accepting arbitrary tokens", () => {
  const brief = browserOfferBriefFromIntake(
    {
      brandName: "Harbor Field",
      productName: "Harbor Field travel bottle",
      audience: "Mobile shoppers.",
      objective: "Reach the listing.",
      offer: "20% off",
      destinationUrl: "https://example.com/harbor-field",
      facts: [
        { label: "Capacity", value: "500 ml" },
        { label: "Closure", value: "Screw cap" },
      ],
      packshot: {
        src: "blob:http://localhost/local-packshot",
        width: 1200,
        height: 1500,
        alt: "Bottle.",
        rights: "Local only.",
        contentHash: "b".repeat(64),
        fileName: "bottle.png",
      },
      reviewedOn: "2026-11-18",
    },
    { accent: "#244fae" },
  );
  assert.equal(brief.accent, "#244fae");
  assert.equal("tokens" in brief, false);
  assert.equal("catalog" in brief, false);
});
test("accent survives successful generation and deterministic fallback", async () => {
  const { buildBrowserOfferCatalog } = await import(
    "../src/lib/campaign-lab/browser-offer.ts"
  );
  const parsed = parseBrowserOfferBriefRequest({
    ...request(),
    accent: "#244fae",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const built = buildBrowserOfferCatalog(parsed.input);
  const values = {
    ...createFormValues(built.fixture, built.catalog),
    accent: parsed.accent!,
  };

  const success = await runCampaignGeneration(
    { fixtureId: built.fixture.id, values },
    {
      env: {
        CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
        CAMPAIGN_LAB_GENERATION_TEST_MODE: "success",
      },
      catalog: built.catalog,
    },
  );
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal(success.preview.theme.tokens.accent, "#244fae");
    assert.equal(success.generation.status, "generated");
  }

  for (const [mode, code] of [
    ["invalid", "invalid"],
    ["timeout", "timeout"],
  ] as const) {
    const fallback = await runCampaignGeneration(
      { fixtureId: built.fixture.id, values },
      {
        env: {
          CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
          CAMPAIGN_LAB_GENERATION_TEST_MODE: mode,
          CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "50",
        },
        catalog: built.catalog,
      },
    );
    assert.equal(fallback.ok, true, mode);
    if (fallback.ok) {
      assert.equal(fallback.generation.status, "fallback", mode);
      assert.equal(fallback.generation.code, code, mode);
      assert.equal(fallback.preview.theme.tokens.accent, "#244fae", mode);
    }
  }
});


test("direction IDs are closed scalar inputs and old briefs retain Clear", () => {
  for(const directionId of [null,0,true,[],{},"morrow","EDITORIAL"," editorial "]) {
    const parsed=parseBrowserOfferBriefRequest({...request(),directionId});
    assert.equal(parsed.ok,false);
    if(!parsed.ok)assert.ok(parsed.issues.some(issue=>issue.field==="directionId"&&/clear.*editorial/.test(issue.message)));
  }
  const old=parseBrowserOfferBriefRequest(request());assert.ok(old.ok);assert.equal(old.input.directionId,"clear");
  const injected=parseBrowserOfferBriefRequest({...request(),directionId:"editorial",tokens:{accent:"red"}});assert.equal(injected.ok,false);
});

test("server-resolved directions reach the real provider context and fallback without changing approved inputs", async () => {
  const results=[];
  for(const directionId of ["clear","editorial"]) {
    const parsed=parseBrowserOfferBriefRequest({...request(),directionId,accent:"#663399"});assert.ok(parsed.ok);
    const {catalog,fixture}=buildBrowserOfferCatalog(parsed.input),values=createFormValues(fixture,catalog);
    assert.equal(values.accent,"#663399");
    let calls=0;
    const delegate=new LocalTestGenerationProvider();
    const generated=await runCampaignGeneration({fixtureId:fixture.id,values},{catalog,provider:{id:"local-test",label:"Observed local test",generate:async (context,options)=>{
      calls++;assert.equal(context.brand.name,request().brandName);assert.equal(context.brand.wordmark,request().brandName);
      assert.equal(context.brand.visualDirection?.id,directionId);assert.equal(context.brand.tokens.accent,"#663399");
      assert.equal(context.brand.tokens.displayFont,directionId==="editorial"?"Georgia, serif":"var(--font-sans), ui-sans-serif, system-ui, sans-serif");
      return delegate.generate(context,options);
    }}});
    assert.ok(generated.ok);assert.equal(calls,1);
    for(const mode of ["invalid","timeout"] as const) {
      const fallback=await runCampaignGeneration({fixtureId:fixture.id,values},{catalog,provider:new LocalTestGenerationProvider(mode),timeoutMs:50});
      assert.ok(fallback.ok);assert.equal(fallback.generation.status,"fallback");assert.equal(fallback.preview.theme.brand.visualDirection?.id,directionId);
      assert.equal(fallback.preview.brief.offer,request().offer);assert.equal(fallback.preview.brief.destinationUrl,request().destinationUrl);
    }
    results.push(generated.preview);
    assert.equal(generated.preview.theme.brand.name,request().brandName);
    assert.equal(generated.preview.theme.tokens.accent,"#663399");
    assert.equal(parsed.context.ownerConfirmed,false);assert.equal(parsed.context.assetBytesVerified,false);
  }
  assert.notEqual(results[0].revision,results[1].revision);
  assert.deepEqual(results[0].draft,results[1].draft);
  assert.deepEqual(results[0].asset,results[1].asset);
});

test("prepared and session briefs preserve direction/override; invalid imports are rejected as a unit", () => {
  const brief={schemaVersion:1,brandName:"Synthetic",productName:"Synthetic bottle",offer:"20% off",destinationUrl:"https://example.com/bottle",facts:[{label:"Body",value:"Steel"},{label:"Size",value:"500 ml"}],alt:"Bottle",rights:"Synthetic owned fixture",directionId:"editorial",accent:"#663399"};
  const parsed=parsePreparedOfferIntakeBrief(JSON.stringify(brief));assert.ok(parsed.ok);assert.equal(parsed.brief.directionId,"editorial");assert.equal(parsed.brief.accent,"#663399");
  const saved=parsePersistedOfferIntakeBrief(serializePersistedOfferIntakeBrief({...parsed.brief,audience:"",objective:""}));assert.equal(saved?.directionId,"editorial");assert.equal(saved?.accent,"#663399");
  for(const patch of [{directionId:null},{directionId:"unknown"},{accent:"red"}])assert.equal(parsePreparedOfferIntakeBrief(JSON.stringify({...brief,...patch})).ok,false);
  const partial=parsePersistedOfferIntakeBrief(JSON.stringify({...brief,accent:"#66"}));assert.equal(partial?.accent,"#66");assert.equal(partial?.productName,brief.productName);
  assert.equal(brief.directionId,"editorial");
});
