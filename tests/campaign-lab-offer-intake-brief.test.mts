import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPersistedBriefContent,
  parsePersistedOfferIntakeBrief,
  parsePreparedOfferIntakeBrief,
  serializePersistedOfferIntakeBrief,
} from "../src/lib/campaign-lab/offer-intake-brief.ts";

const brief = {
  brandName: "Harbor Field",
  productName: "Harbor Field bottle",
  audience: "Commuters who saw the bottle in a mobile ad.",
  objective: "Reach the marketplace listing with the exact offer.",
  offer: "Free shipping through 30 November 2026, on every order",
  destinationUrl: "https://example.com/harbor-field",
  facts: [
    { label: "Material", value: "Recycled glass" },
    { label: "Capacity", value: "750 ml" },
  ],
  alt: "Synthetic Harbor Field bottle on a plain background.",
  rights: "Synthetic fixture for local UI checks only.",
};

test("the persisted brief round-trips current text fields and facts", () => {
  const serialized = serializePersistedOfferIntakeBrief(brief);
  assert.doesNotMatch(serialized, /blob:|approval/i);
  assert.deepEqual(parsePersistedOfferIntakeBrief(serialized), {
    schemaVersion: 1,
    ...brief,
  });
});

test("invalid or older storage payloads are ignored", () => {
  assert.equal(parsePersistedOfferIntakeBrief(null), null);
  assert.equal(parsePersistedOfferIntakeBrief(""), null);
  assert.equal(parsePersistedOfferIntakeBrief("not json"), null);
  assert.equal(parsePersistedOfferIntakeBrief("[]"), null);
  assert.equal(
    parsePersistedOfferIntakeBrief(JSON.stringify({ schemaVersion: 2, ...brief })),
    null,
  );
});

test("fact rows are capped and padded to the intake shape", () => {
  const parsed = parsePersistedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      ...brief,
      facts: [
        { label: "One", value: "1" },
        { label: "Two", value: "2" },
        { label: "Three", value: "3" },
        { label: "Four", value: "4" },
      ],
    }),
  );
  assert.equal(parsed?.facts.length, 3);
  assert.deepEqual(parsed?.facts, [
    { label: "One", value: "1" },
    { label: "Two", value: "2" },
    { label: "Three", value: "3" },
  ]);

  const sparse = parsePersistedOfferIntakeBrief(
    JSON.stringify({ schemaVersion: 1, facts: [{ label: "Only" }] }),
  );
  assert.deepEqual(sparse?.facts, [
    { label: "Only", value: "" },
    { label: "", value: "" },
  ]);
});

test("non-string fields and accidental image or approval keys are not restored", () => {
  const parsed = parsePersistedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      brandName: 42,
      productName: null,
      audience: ["not", "text"],
      objective: false,
      offer: { value: "not a string" },
      destinationUrl: ["https://example.com"],
      facts: "not an array",
      alt: true,
      rights: "Confirmed.",
      packshot: "blob:http://localhost/temporary",
      approval: { revision: "abc" },
    }),
  );
  assert.equal(parsed?.brandName, "");
  assert.equal(parsed?.productName, "");
  assert.equal(parsed?.audience, "");
  assert.equal(parsed?.objective, "");
  assert.equal(parsed?.offer, "");
  assert.equal(parsed?.destinationUrl, "");
  assert.deepEqual(parsed?.facts, [
    { label: "", value: "" },
    { label: "", value: "" },
  ]);
  assert.equal(parsed?.alt, "");
  assert.equal(parsed?.rights, "Confirmed.");
});

test("empty saved fields do not trigger the restored-brief notice", () => {
  const empty = parsePersistedOfferIntakeBrief(
    serializePersistedOfferIntakeBrief({
      brandName: "",
      productName: "",
      audience: "",
      objective: "",
      offer: "",
      destinationUrl: "",
      facts: [
        { label: "", value: "" },
        { label: "", value: "" },
      ],
      alt: "",
      rights: "",
    }),
  );
  assert.ok(empty);
  assert.equal(hasPersistedBriefContent(empty), false);
  assert.equal(hasPersistedBriefContent({ ...empty, offer: "30% off" }), true);
});

test("a prepared brief loads every text field verbatim", () => {
  const parsed = parsePreparedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      brandName: "Harbor Field",
      productName: "Harbor Field  bottle",
      audience: "Commuters who saw a mobile ad.",
      objective: "Reach the exact offer page.",
      offer: "Free shipping through 30 November 2026, on every order",
      destinationUrl: "https://example.com/harbor-field",
      facts: [
        { label: "Material", value: "Recycled glass" },
        { label: "Capacity", value: "750 ml" },
      ],
      alt: "Synthetic Harbor Field bottle on a plain background.",
      rights: "Synthetic fixture for local UI checks only.",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.brief, {
    brandName: "Harbor Field",
    productName: "Harbor Field  bottle",
    audience: "Commuters who saw a mobile ad.",
    objective: "Reach the exact offer page.",
    offer: "Free shipping through 30 November 2026, on every order",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Material", value: "Recycled glass" },
      { label: "Capacity", value: "750 ml" },
    ],
    alt: "Synthetic Harbor Field bottle on a plain background.",
    rights: "Synthetic fixture for local UI checks only.",
  });
});

test("an invalid prepared brief explains the error and returns no draft", () => {
  const malformed = parsePreparedOfferIntakeBrief("not json");
  assert.equal(malformed.ok, false);
  assert.match(
    malformed.ok ? "" : malformed.error,
    /valid JSON/i,
  );

  const missingProduct = parsePreparedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      productName: "",
      offer: "Free shipping",
      destinationUrl: "https://example.com/harbor-field",
      facts: [
        { label: "Material", value: "Glass" },
        { label: "Capacity", value: "750 ml" },
      ],
      alt: "Bottle.",
      rights: "Local only.",
    }),
  );
  assert.equal(missingProduct.ok, false);
  assert.match(
    missingProduct.ok ? "" : missingProduct.error,
    /Product name is required/i,
  );

  const badUrl = parsePreparedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      productName: "Harbor Field bottle",
      offer: "Free shipping",
      destinationUrl: "not-a-url",
      facts: [
        { label: "Material", value: "Glass" },
        { label: "Capacity", value: "750 ml" },
      ],
      alt: "Bottle.",
      rights: "Local only.",
    }),
  );
  assert.equal(badUrl.ok, false);
  assert.match(badUrl.ok ? "" : badUrl.error, /valid URL/i);

  const tooManyFacts = parsePreparedOfferIntakeBrief(
    JSON.stringify({
      schemaVersion: 1,
      productName: "Harbor Field bottle",
      offer: "Free shipping",
      destinationUrl: "https://example.com/harbor-field",
      facts: [
        { label: "One", value: "1" },
        { label: "Two", value: "2" },
        { label: "Three", value: "3" },
        { label: "Four", value: "4" },
      ],
      alt: "Bottle.",
      rights: "Local only.",
    }),
  );
  assert.equal(tooManyFacts.ok, false);
  assert.match(
    tooManyFacts.ok ? "" : tooManyFacts.error,
    /no more than 3 facts/i,
  );
});
