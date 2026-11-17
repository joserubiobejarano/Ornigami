import assert from "node:assert/strict";
import test from "node:test";

import { findApprovedOfferPrice } from "../src/lib/campaign-lab/offer-emphasis.ts";

test("the reviewed final price is emphasised, not the first currency amount", () => {
  const offer = "30% off, was $10, now $4.94";
  const range = findApprovedOfferPrice(offer, "$4.94");

  assert.ok(range);
  assert.equal(range.text, "$4.94");
  assert.equal(range.start, 22);
  assert.equal(offer.slice(0, range.start) + range.text + offer.slice(range.end), offer);
});

test("a different reviewed substring can be emphasised when explicitly approved", () => {
  const offer = "30% off, was $10, now $4.94";
  const range = findApprovedOfferPrice(offer, "$10");

  assert.ok(range);
  assert.equal(range.text, "$10");
  assert.equal(offer.slice(0, range.start) + range.text + offer.slice(range.end), offer);
});

test("missing, blank, and non-matching approved prices keep the offer unstyled", () => {
  const offer = "30% off, was $10, now $4.94";
  assert.equal(findApprovedOfferPrice(offer, undefined), null);
  assert.equal(findApprovedOfferPrice(offer, "  "), null);
  assert.equal(findApprovedOfferPrice(offer, "$5.00"), null);
});

test("the complete offer text is preserved around the emphasised substring", () => {
  const offer = "30% off for Black Friday, $4.94";
  const range = findApprovedOfferPrice(offer, "$4.94");
  assert.ok(range);
  assert.equal(offer, "30% off for Black Friday, $4.94");
  assert.equal(offer.slice(0, range.start), "30% off for Black Friday, ");
  assert.equal(offer.slice(range.end), "");
});
