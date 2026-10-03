import assert from "node:assert/strict";
import test from "node:test";
import { isSafeGoogleReviewUrl } from "../src/modules/review-booster/services/settings-link-validation.ts";
import { loadTs } from "./auth-test-harness.mts";

type LinkRoute = { GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> };

function setup(reviewUrl: string) {
  let clickWrites = 0;
  let businessReads = 0;
  const route = loadTs<LinkRoute>("src/app/r/[token]/route.ts", { overrides: {
    "next/server": {
      NextResponse: class extends Response {
        constructor(body?: BodyInit | null, init?: ResponseInit) { super(body, init); }
      },
    },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO public.review_link_clicks")) { clickWrites++; return []; }
      if (query.includes("SELECT name FROM public.businesses")) { businessReads++; return [{ name: "Example" }]; }
      throw new Error("unexpected query");
    } },
    "@/lib/review-link-token": { verifyReviewLinkToken: () => ({ businessId: "business-1", visitId: "visit-1", reviewUrl }) },
    "@/modules/review-booster/services/settings-link-validation": { isSafeGoogleReviewUrl },
  } });
  return { route, clickWrites: () => clickWrites, businessReads: () => businessReads };
}

test("tracked links reject a signed unsafe destination before recording a click", async () => {
  const fixture = setup("https://attacker.example/redirect?to=https://google.com");
  const response = await fixture.route.GET(new Request("https://app.example/r/signed-token"), { params: Promise.resolve({ token: "signed-token" }) });
  assert.equal(response.status, 404);
  assert.equal(fixture.clickWrites(), 0);
  assert.equal(fixture.businessReads(), 0);
});

test("tracked links allow a direct Google review destination and record the click", async () => {
  const fixture = setup("https://search.google.com/local/writereview?placeid=ChIJ123");
  const response = await fixture.route.GET(new Request("https://app.example/r/signed-token"), { params: Promise.resolve({ token: "signed-token" }) });
  assert.equal(response.status, 200);
  assert.equal(fixture.clickWrites(), 1);
  assert.equal(fixture.businessReads(), 1);
  assert.match(await response.text(), /href="https:\/\/search\.google\.com\/local\/writereview\?placeid=ChIJ123"/);
});
