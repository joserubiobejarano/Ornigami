/**
 * Pure evaluation logic for the campaign-lab evaluation pack.
 *
 * The pack separates three kinds of evidence:
 *   1. What the files and draft JSON can prove: approved facts, exact offer,
 *      exact destination, asset identity, budgets, and claim traceability.
 *   2. What a browser render can prove: overflow, links, crops, hierarchy at a
 *      viewport, keyboard access.
 *   3. What only a human can confirm: whether the pictured packaging is the
 *      approved product, whether the page feels like the brand, and whether the
 *      composition is worth shipping.
 *
 * Nothing here imports the app route, renderer, or provider adapter.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const HARD_GATES = new Set([
  "input-required",
  "campaign-fixed-facts",
  "asset-approved",
  "asset-hash-pinned",
  "facts-approved",
  "claim-traceability",
  "revision-applied",
  "revision-old-values-absent",
  "revision-preserves-unrelated",
  "revision-invalidates-approval",
]);

const PROOF_PATTERNS = [
  /[★⭐]/u,
  /\b\d[\d,.]*\s*(?:five[- ]star|star|reviews?|ratings?|customers?)\b/i,
  /\b(?:customer|verified|product|user)\s+reviews?\b/i,
  /\b(?:ratings?|testimonials?|verified buyers?)\b/i,
];

const ABSOLUTE_PATTERNS = [
  /\b(?:best|finest|perfect|unbreakable|indestructible|never leaks?|always|guaranteed|guarantee|lifetime)\b/i,
  /\bkeeps? (?:drinks?|water|coffee|tea) (?:cold|hot) for\b/i,
];

const NUMBER_PATTERN = /\d[\d,.]*/g;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export function comparableText(value) {
  return normalizeText(value).toLowerCase();
}

export function wordCount(value) {
  const matches = normalizeText(value).match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function tokens(value) {
  return new Set(
    normalizeText(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 2) ?? [],
  );
}

export function jaccard(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : Number((intersection / union).toFixed(3));
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadPack(packFile) {
  const pack = readJson(packFile);
  const fixturesDir = path.dirname(packFile);
  const casesById = new Map(pack.cases.map((caseDef) => [caseDef.id, caseDef]));
  return { pack, packFile, fixturesDir, casesById };
}

function resolveAssetFile(fixturesDir, asset) {
  return path.resolve(fixturesDir, asset.file);
}

function numericTokens(value) {
  const seen = new Set();
  for (const raw of normalizeText(value).match(NUMBER_PATTERN) ?? []) {
    const normalized = raw.replace(/,/g, "").replace(/[.]+$/, "");
    if (normalized) seen.add(normalized);
  }
  return seen;
}

function approvedCorpus(caseDef, fixed = {}) {
  const parts = [
    fixed.offer ?? caseDef.campaign.offer,
    fixed.productName ?? caseDef.campaign.productName,
    fixed.actionLabel ?? caseDef.campaign.actionLabel,
    caseDef.campaign.productNoun,
    caseDef.approvedStory ?? "",
    ...caseDef.approvedFacts.flatMap((fact) => [fact.label, fact.value]),
  ];
  return parts.join(" ");
}

function phraseRegex(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function standaloneRegex(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, "i");
}

function findPhrases(text, phrases) {
  const found = [];
  for (const phrase of phrases) {
    if (phraseRegex(phrase).test(text)) found.push(phrase);
  }
  return found;
}

/**
 * Scan visible narrative text for claims that cannot be traced to the approved
 * inputs. This is deliberately conservative: it catches known forbidden
 * phrases, invented proof, absolute guarantees, and numbers that do not appear
 * in the approved fact or offer corpus. It cannot prove that the remaining
 * prose is true; a human still reviews meaning.
 */
export function scanClaims(text, caseDef, pack, fixed = {}) {
  const rawPack = pack?.pack ?? pack;
  const forbidden = [...(rawPack.globalForbiddenClaims ?? []), ...(caseDef.forbiddenClaims ?? [])];
  const forbiddenFound = findPhrases(text, forbidden);
  const proofFound = PROOF_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
  const absoluteFound = ABSOLUTE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
  const allowedNumbers = numericTokens(approvedCorpus(caseDef, fixed));
  const draftNumbers = numericTokens(text);
  const unsupportedNumbers = [...draftNumbers].filter((number) => !allowedNumbers.has(number));
  return {
    forbiddenFound,
    proofFound,
    absoluteFound,
    unsupportedNumbers,
    allowedNumbers: [...allowedNumbers],
    ok:
      forbiddenFound.length === 0 &&
      proofFound.length === 0 &&
      absoluteFound.length === 0 &&
      unsupportedNumbers.length === 0,
  };
}

function check(id, state, detail, evidence = {}) {
  return { id, state, detail, evidence };
}

export function artifactText(artifact) {
  const draft = artifact?.draft ?? {};
  return [
    draft.headline,
    draft.lede,
    draft.story,
    ...(draft.facts ?? []).flatMap((fact) => [fact.label, fact.value]),
    ...(draft.sections ?? []).map((section) => section.heading),
    ...(draft.claims ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

export function artifactCampaignText(artifact) {
  const campaign = artifact?.campaign ?? {};
  return [
    campaign.productName,
    campaign.offer,
    campaign.destinationUrl,
    campaign.actionLabel,
    artifactText(artifact),
  ]
    .filter(Boolean)
    .join("\n");
}

function approvedFactKey(fact) {
  return `${comparableText(fact.label)}::${comparableText(fact.value)}`;
}

function approvedFactById(caseDef, factId) {
  return caseDef.approvedFacts.find((fact) => fact.id === factId);
}

function factPresent(draftFacts, approvedFact) {
  const target = approvedFactKey(approvedFact);
  return (draftFacts ?? []).some((fact) => approvedFactKey(fact) === target);
}

function evidenceCount(artifact, caseDef) {
  const approvedById = new Map(caseDef.approvedAssets.map((asset) => [asset.id, asset]));
  const heroIds = new Set(
    caseDef.approvedAssets.filter((asset) => asset.role === "product-hero").map((asset) => asset.id),
  );
  const draft = artifact?.draft ?? {};
  const facts = (draft.facts ?? []).filter((fact) =>
    caseDef.approvedFacts.some((approved) => approvedFactKey(approved) === approvedFactKey(fact)),
  ).length;
  const story = draft.story && caseDef.approvedStory && comparableText(draft.story).includes(comparableText(caseDef.approvedStory)) ? 1 : 0;
  const supportingAssets = (draft.assetIds ?? []).filter((id) => approvedById.has(id) && !heroIds.has(id)).length;
  return facts + story + supportingAssets;
}

export function validateArtifact(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object") return ["artifact is not an object"];
  if (artifact.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!artifact.caseId) errors.push("caseId is required");
  if (!["baseline", "generated"].includes(artifact.source)) errors.push('source must be "baseline" or "generated"');
  if (!artifact.template?.id) errors.push("template.id is required");
  if (!artifact.template?.version) errors.push("template.version is required");
  if (!artifact.campaign || typeof artifact.campaign !== "object") errors.push("campaign is required");
  if (!artifact.draft || typeof artifact.draft !== "object") errors.push("draft is required");
  if (typeof artifact.draft?.headline !== "string") errors.push("draft.headline must be a string");
  if (typeof artifact.draft?.lede !== "string") errors.push("draft.lede must be a string");
  if (!Array.isArray(artifact.draft?.facts)) errors.push("draft.facts must be an array");
  if (!Array.isArray(artifact.draft?.sections)) errors.push("draft.sections must be an array");
  if (!Array.isArray(artifact.draft?.assetIds)) errors.push("draft.assetIds must be an array");
  if (artifact.draft?.claims != null && !Array.isArray(artifact.draft.claims)) errors.push("draft.claims must be an array when present");
  return errors;
}

export function validateRevisionBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== "object") return ["revision bundle is not an object"];
  if (bundle.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!bundle.caseId) errors.push("caseId is required");
  for (const side of ["before", "after"]) {
    for (const error of validateArtifact(bundle[side])) errors.push(`${side}: ${error}`);
  }
  if (!bundle.change?.fromOffer || !bundle.change?.toOffer) errors.push("change.fromOffer and change.toOffer are required");
  if (!bundle.change?.fromDestination || !bundle.change?.toDestination) errors.push("change.fromDestination and change.toDestination are required");
  return errors;
}

export function loadArtifacts(dir) {
  if (!existsSync(dir)) return { drafts: new Map(), revisions: new Map(), errors: [`Directory not found: ${dir}`] };
  const drafts = new Map();
  const revisions = new Map();
  const errors = [];
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".json")).sort()) {
    const file = path.join(dir, name);
    let artifact;
    try {
      artifact = readJson(file);
    } catch (error) {
      errors.push(`${name}: invalid JSON (${error.message})`);
      continue;
    }
    if (artifact.before && artifact.after) {
      const problems = validateRevisionBundle(artifact);
      if (problems.length) errors.push(`${name}: ${problems.join("; ")}`);
      else if (revisions.has(artifact.caseId)) errors.push(`${name}: duplicate revision for ${artifact.caseId}`);
      else revisions.set(artifact.caseId, { ...artifact, file: name });
      continue;
    }
    const problems = validateArtifact(artifact);
    if (problems.length) errors.push(`${name}: ${problems.join("; ")}`);
    else if (drafts.has(artifact.caseId)) errors.push(`${name}: duplicate draft for ${artifact.caseId}`);
    else drafts.set(artifact.caseId, { ...artifact, file: name });
  }
  return { drafts, revisions, errors };
}

function fixedFor(caseDef, override = {}) {
  return {
    offer: override.offer ?? caseDef.campaign.offer,
    destinationUrl: override.destinationUrl ?? caseDef.campaign.destinationUrl,
    actionLabel: override.actionLabel ?? caseDef.mustStayExact.actionLabel,
    productName: override.productName ?? caseDef.mustStayExact.productName,
  };
}

export function evaluateDraft(artifact, caseDef, pack, options = {}) {
  const checks = [];
  const fixed = fixedFor(caseDef, options.expected);
  const campaign = artifact.campaign ?? {};
  const draft = artifact.draft ?? {};
  const approvedIds = new Set(caseDef.approvedAssets.map((asset) => asset.id));

  // 1. Required inputs.
  const missing = [];
  if (!normalizeText(campaign.productName)) missing.push("product name");
  if (!normalizeText(campaign.offer)) missing.push("offer");
  if (!normalizeText(campaign.destinationUrl)) missing.push("destination URL");
  if (!normalizeText(campaign.actionLabel)) missing.push("action label");
  if (!Array.isArray(draft.assetIds) || draft.assetIds.length === 0) missing.push("approved image");
  checks.push(
    check(
      "input-required",
      missing.length === 0 ? "passed" : "failed",
      missing.length === 0
        ? "All required campaign inputs are present."
        : `Missing required input: ${missing.join(", ")}.`,
      { missing },
    ),
  );

  // 2. Fixed campaign facts.
  const fixedMismatch = [];
  if (normalizeText(campaign.offer) !== normalizeText(fixed.offer)) fixedMismatch.push("offer");
  if (normalizeText(campaign.destinationUrl) !== normalizeText(fixed.destinationUrl)) fixedMismatch.push("destinationUrl");
  if (normalizeText(campaign.actionLabel) !== normalizeText(fixed.actionLabel)) fixedMismatch.push("actionLabel");
  if (normalizeText(campaign.productName) !== normalizeText(fixed.productName)) fixedMismatch.push("productName");
  checks.push(
    check(
      "campaign-fixed-facts",
      fixedMismatch.length === 0 ? "passed" : "failed",
      fixedMismatch.length === 0
        ? "Offer, destination, action label, and product name match the approved campaign facts."
        : `Changed campaign fact(s): ${fixedMismatch.join(", ")}.`,
      {
        expected: fixed,
        observed: {
          offer: campaign.offer,
          destinationUrl: campaign.destinationUrl,
          actionLabel: campaign.actionLabel,
          productName: campaign.productName,
        },
      },
    ),
  );

  // 3. Asset identity by ID.
  const unknownAssets = (draft.assetIds ?? []).filter((id) => !approvedIds.has(id));
  const missingHero = !caseDef.approvedAssets.some(
    (asset) => asset.role === "product-hero" && (draft.assetIds ?? []).includes(asset.id),
  );
  checks.push(
    check(
      "asset-approved",
      unknownAssets.length === 0 && !missingHero ? "passed" : "failed",
      unknownAssets.length === 0 && !missingHero
        ? "Every referenced asset is in the approved set and the product hero is present."
        : `${unknownAssets.length ? `Unapproved asset(s): ${unknownAssets.join(", ")}. ` : ""}${missingHero ? "The approved product hero is missing." : ""}`.trim(),
      { assetIds: draft.assetIds, unknownAssets, missingHero, approved: [...approvedIds] },
    ),
  );

  // 4. Asset bytes pinned. The pack validation hashes the fixture files; an
  //    artifact may also carry the expected hashes it rendered.
  const expectedHashes = caseDef.mustStayExact.assetSha256 ?? {};
  const observedHashes = options.assetSha256 ?? draft.assetSha256 ?? null;
  if (!observedHashes || Object.keys(observedHashes).length === 0) {
    checks.push(
      check(
        "asset-hash-pinned",
        "unassessed",
        "The draft names approved asset IDs. Byte identity is verified by pack validation and the browser capture, not by this draft artifact.",
        { expectedHashes, note: "Supply draft.assetSha256 or use campaign-eval-browser.mjs to pin served bytes." },
      ),
    );
  } else {
    const hashMismatch = Object.entries(expectedHashes)
      .filter(([id]) => (draft.assetIds ?? []).includes(id) || observedHashes[id])
      .filter(([id, digest]) => observedHashes[id] !== digest)
      .map(([id]) => id);
    checks.push(
      check(
        "asset-hash-pinned",
        hashMismatch.length === 0 ? "passed" : "failed",
        hashMismatch.length === 0
          ? "Every referenced asset carries the approved SHA-256."
          : `Asset byte mismatch: ${hashMismatch.join(", ")}.`,
        { expectedHashes, observedHashes, hashMismatch },
      ),
    );
  }

  // 5. Facts are approved and complete enough.
  const draftFacts = Array.isArray(draft.facts) ? draft.facts : [];
  const unapprovedFacts = draftFacts.filter(
    (fact) => !caseDef.approvedFacts.some((approved) => approvedFactKey(approved) === approvedFactKey(fact)),
  );
  const missingFactIds = (caseDef.expected.draft.requiredFactIds ?? []).filter((factId) => {
    const approved = approvedFactById(caseDef, factId);
    return approved ? !factPresent(draftFacts, approved) : true;
  });
  const approvedFactCount = draftFacts.length - unapprovedFacts.length;
  checks.push(
    check(
      "facts-approved",
      unapprovedFacts.length === 0 && missingFactIds.length === 0 && approvedFactCount >= caseDef.expected.draft.minFacts
        ? "passed"
        : "failed",
      unapprovedFacts.length === 0 && missingFactIds.length === 0 && approvedFactCount >= caseDef.expected.draft.minFacts
        ? `${approvedFactCount} approved fact(s) used; required facts are present.`
        : [
            unapprovedFacts.length ? `Unapproved fact(s): ${unapprovedFacts.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}.` : "",
            missingFactIds.length ? `Missing required fact(s): ${missingFactIds.join(", ")}.` : "",
            approvedFactCount < caseDef.expected.draft.minFacts ? `Only ${approvedFactCount} approved fact(s); expected at least ${caseDef.expected.draft.minFacts}.` : "",
          ].filter(Boolean).join(" "),
      { draftFacts, unapprovedFacts, missingFactIds, approvedFactCount },
    ),
  );

  // 6. Claim traceability.
  const text = artifactText(artifact);
  const claims = scanClaims(text, caseDef, pack, fixed);
  const { forbiddenFound, proofFound, absoluteFound, unsupportedNumbers, allowedNumbers } = claims;
  const claimFailure = !claims.ok;
  checks.push(
    check(
      "claim-traceability",
      claimFailure ? "failed" : "passed",
      claimFailure
        ? [
            forbiddenFound.length ? `Forbidden claim(s): ${forbiddenFound.join(", ")}.` : "",
            proofFound.length ? "Invented proof or review language is present." : "",
            absoluteFound.length ? "An absolute or unsupported guarantee is present." : "",
            unsupportedNumbers.length ? `Number(s) not traceable to approved inputs: ${unsupportedNumbers.join(", ")}.` : "",
          ].filter(Boolean).join(" ")
        : "Every narrative claim is traceable to approved facts, story, offer, or terms.",
      { forbiddenFound, proofFound, absoluteFound, unsupportedNumbers, allowedNumbers },
    ),
  );

  // 7. Copy budget.
  const visibleText = [
    draft.headline,
    draft.lede,
    ...draftFacts.flatMap((fact) => [fact.label, fact.value]),
    campaign.offer,
    campaign.actionLabel,
  ]
    .filter(Boolean)
    .join(" ");
  const words = wordCount(visibleText);
  checks.push(
    check(
      "budget-length",
      words <= caseDef.expected.draft.maxWords ? "passed" : "failed",
      `Visible page copy is ${words} words; the case budget is ${caseDef.expected.draft.maxWords}.`,
      { words, maxWords: caseDef.expected.draft.maxWords },
    ),
  );

  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  checks.push(
    check(
      "budget-sections",
      sections.length > 0 && sections.length <= caseDef.expected.draft.maxSections ? "passed" : "failed",
      `The draft has ${sections.length} section(s); the case budget is 1–${caseDef.expected.draft.maxSections}.`,
      { sections: sections.map((section) => section.id), maxSections: caseDef.expected.draft.maxSections },
    ),
  );

  // 8. Opening.
  const openingText = [draft.headline, draft.lede, sections[0]?.heading].filter(Boolean).join(" ");
  const openingTerms = caseDef.expected.draft.openingTerms ?? [];
  if (openingTerms.length === 0) {
    checks.push(check("opening-terms", "passed", "No required opening term for this case.", { openingTerms }));
  } else {
    const found = findPhrases(openingText, openingTerms);
    checks.push(
      check(
        "opening-terms",
        found.length > 0 ? "passed" : "failed",
        found.length > 0
          ? `The opening carries the expected term(s): ${found.join(", ")}.`
          : `The opening does not carry any expected term: ${openingTerms.join(", ")}.`,
        { openingText, openingTerms, found },
      ),
    );
  }

  // 9. Evidence density.
  if (caseDef.expected.draft.minEvidenceItems != null) {
    const count = evidenceCount(artifact, caseDef);
    checks.push(
      check(
        "evidence-density",
        count >= caseDef.expected.draft.minEvidenceItems ? "passed" : "failed",
        `The draft uses ${count} approved evidence item(s); the case expects at least ${caseDef.expected.draft.minEvidenceItems}.`,
        { count, min: caseDef.expected.draft.minEvidenceItems, facts: draftFacts.length, assetIds: draft.assetIds },
      ),
    );
  }

  // 10. Focus terms for the campaign angle.
  if ((caseDef.expected.draft.focusTerms ?? []).length > 0) {
    const focusText = [draft.headline, draft.lede].filter(Boolean).join(" ");
    const found = findPhrases(focusText, caseDef.expected.draft.focusTerms);
    checks.push(
      check(
        "focus-terms",
        found.length > 0 ? "passed" : "failed",
        found.length > 0
          ? `The opening carries the campaign angle: ${found.join(", ")}.`
          : `The opening does not carry the campaign angle terms: ${caseDef.expected.draft.focusTerms.join(", ")}.`,
        { focusText, focusTerms: caseDef.expected.draft.focusTerms, found },
      ),
    );
  }

  // 11. Packaging truth is never provable from a filename or page label.
  if (caseDef.trap) {
    checks.push(
      check(
        "packaging-truth",
        "unassessed",
        "Filename, asset ID, page label, and alt text cannot prove the printed packaging. A human must read the product crop.",
        { trap: caseDef.trap, expectedAutomatedState: caseDef.trap.expectedAutomatedState },
      ),
    );
  }

  // 12. Approval must name a revision.
  const approval = artifact.approval;
  if (approval) {
    const valid = approval.state !== "approved" || Boolean(approval.revision);
    checks.push(
      check(
        "approval-revision",
        valid ? "passed" : "failed",
        valid
          ? `Approval state is ${approval.state}${approval.revision ? ` at revision ${approval.revision}` : ""}.`
          : "An approved draft must name the exact revision that was approved.",
        { approval },
      ),
    );
  }

  return checks;
}

function firstOfferClause(value) {
  return normalizeText(value).split(/[,;.]/)[0]?.trim() ?? normalizeText(value);
}

export function offerRewriteOnly(beforeText, afterText, fromOffer, toOffer) {
  const before = normalizeText(beforeText);
  const after = normalizeText(afterText);
  if (before === after) return true;
  const replacements = [
    [normalizeText(fromOffer), normalizeText(toOffer)],
    [firstOfferClause(fromOffer), firstOfferClause(toOffer)],
  ];
  for (const [from, to] of replacements) {
    if (from && before.split(from).join(to) === after) return true;
  }
  return false;
}

export function evaluateRevision(bundle, caseDef, pack) {
  const checks = [];
  const { before, after, change } = bundle;
  const beforeExpected = { offer: change.fromOffer, destinationUrl: change.fromDestination };
  const afterExpected = { offer: change.toOffer, destinationUrl: change.toDestination };

  checks.push(
    ...evaluateDraft(before, caseDef, pack, { expected: beforeExpected }).map((item) => ({ ...item, id: `before/${item.id}` })),
  );
  checks.push(
    ...evaluateDraft(after, caseDef, pack, { expected: afterExpected }).map((item) => ({ ...item, id: `after/${item.id}` })),
  );

  const applied = [];
  if (normalizeText(after.campaign.offer) !== normalizeText(change.toOffer)) applied.push("offer");
  if (normalizeText(after.campaign.destinationUrl) !== normalizeText(change.toDestination)) applied.push("destinationUrl");
  checks.push(
    check(
      "revision-applied",
      applied.length === 0 ? "passed" : "failed",
      applied.length === 0
        ? "The late offer and destination change is applied exactly."
        : `The revision did not apply: ${applied.join(", ")}.`,
      { expected: change.toOffer, observed: after.campaign.offer, expectedDestination: change.toDestination, observedDestination: after.campaign.destinationUrl },
    ),
  );

  const afterText = artifactCampaignText(after);
  const oldOfferPresent = standaloneRegex(change.fromOffer).test(afterText);
  const oldDestinationPresent = standaloneRegex(change.fromDestination).test(afterText);
  checks.push(
    check(
      "revision-old-values-absent",
      !oldOfferPresent && !oldDestinationPresent ? "passed" : "failed",
      !oldOfferPresent && !oldDestinationPresent
        ? "The old offer and old destination are absent from the revised campaign."
        : `The revised campaign still contains ${[oldOfferPresent ? "the old offer" : "", oldDestinationPresent ? "the old destination" : ""].filter(Boolean).join(" and ")}.`,
      { oldOfferPresent, oldDestinationPresent, fromOffer: change.fromOffer, fromDestination: change.fromDestination },
    ),
  );

  const preserved = [];
  const headlinePreserved = offerRewriteOnly(before.draft.headline, after.draft.headline, change.fromOffer, change.toOffer);
  const ledePreserved = offerRewriteOnly(before.draft.lede, after.draft.lede, change.fromOffer, change.toOffer);
  if (!headlinePreserved) preserved.push("headline");
  if (!ledePreserved) preserved.push("lede");
  if (before.draft.layout !== after.draft.layout) preserved.push("layout");
  if (JSON.stringify(before.draft.facts) !== JSON.stringify(after.draft.facts)) preserved.push("facts");
  if (JSON.stringify([...(before.draft.assetIds ?? [])].sort()) !== JSON.stringify([...(after.draft.assetIds ?? [])].sort())) preserved.push("assetIds");
  if (JSON.stringify(before.draft.sections ?? []) !== JSON.stringify(after.draft.sections ?? [])) preserved.push("sections");
  checks.push(
    check(
      "revision-preserves-unrelated",
      preserved.length === 0 ? "passed" : "failed",
      preserved.length === 0
        ? "The revision preserved the headline (apart from an offer lead it repeated), lede, facts, sections, layout, and asset identity."
        : `The revision changed unrelated draft content: ${preserved.join(", ")}.`,
      { changed: preserved, headlinePreserved, ledePreserved },
    ),
  );

  const invalidated =
    before.approval?.state === "approved" ? after.approval?.state !== "approved" : null;
  checks.push(
    check(
      "revision-invalidates-approval",
      invalidated === null ? "unassessed" : invalidated ? "passed" : "failed",
      invalidated === null
        ? "The before draft was not approved, so invalidation could not be observed."
        : invalidated
          ? "Changing the offer and destination invalidated the previous approval."
          : "The revised draft still claims approval.",
      { before: before.approval, after: after.approval },
    ),
  );

  return checks;
}

export function compareArtifacts(generated, baseline, referenceGenerated, caseDef, pack) {
  const comparisons = [];

  if (caseDef.expected.differentFrom) {
    const reference = referenceGenerated ?? baseline;
    if (!reference) {
      comparisons.push(check("material-difference", "unassessed", "No reference draft was supplied for comparison."));
    } else {
      const mustDiffer = caseDef.expected.differentFrom.mustDiffer ?? [];
      const differences = [];
      for (const field of mustDiffer) {
        if (field === "assetIds") {
          const left = JSON.stringify([...(generated.draft.assetIds ?? [])].sort());
          const right = JSON.stringify([...(reference.draft.assetIds ?? [])].sort());
          if (left === right) differences.push(field);
        } else if (field === "headline") {
          if (normalizeText(generated.draft.headline) === normalizeText(reference.draft.headline)) differences.push(field);
        } else if (field === "lede") {
          if (normalizeText(generated.draft.lede) === normalizeText(reference.draft.lede)) differences.push(field);
        } else if (field === "offer") {
          if (normalizeText(generated.campaign.offer) === normalizeText(reference.campaign.offer)) differences.push(field);
        } else if (field === "destinationUrl") {
          if (normalizeText(generated.campaign.destinationUrl) === normalizeText(reference.campaign.destinationUrl)) differences.push(field);
        } else if (field === "actionLabel") {
          if (normalizeText(generated.campaign.actionLabel) === normalizeText(reference.campaign.actionLabel)) differences.push(field);
        } else if (field === "brandId") {
          if (generated.campaign.brandId === reference.campaign.brandId) differences.push(field);
        } else if (field === "productName") {
          if (normalizeText(generated.campaign.productName) === normalizeText(reference.campaign.productName)) differences.push(field);
        } else {
          const left = JSON.stringify(generated.campaign[field] ?? "");
          const right = JSON.stringify(reference.campaign[field] ?? "");
          if (left === right) differences.push(field);
        }
      }
      const delta = evidenceCount(generated, caseDef) - evidenceCount(reference, caseDef);
      const minDelta = caseDef.expected.differentFrom.minEvidenceItemDelta ?? 0;
      const ok = differences.length === 0 && delta >= minDelta;
      comparisons.push(
        check(
          "material-difference",
          ok ? "passed" : "failed",
          ok
            ? `The draft differs from ${reference.caseId} on every required field and carries ${delta} more evidence item(s).`
            : `The draft is not materially different: ${differences.length ? `still equal on ${differences.join(", ")}. ` : ""}${delta < minDelta ? `Evidence delta is ${delta}, expected at least ${minDelta}.` : ""}`.trim(),
          { referenceCaseId: reference.caseId, differences, evidenceDelta: delta, minDelta },
        ),
      );
    }
  }

  if (caseDef.expected.openingShift) {
    const reference = referenceGenerated ?? baseline;
    if (!reference) {
      comparisons.push(check("opening-shift", "unassessed", "No reference draft was supplied for the intent-change comparison."));
    } else {
      const fixedFields = caseDef.expected.openingShift.mustPreserve ?? [];
      const fixedChanges = [];
      for (const field of fixedFields) {
        if (field === "assetIds") {
          const left = JSON.stringify([...(generated.draft.assetIds ?? [])].sort());
          const right = JSON.stringify([...(reference.draft.assetIds ?? [])].sort());
          if (left !== right) fixedChanges.push(field);
        } else if (field === "assetSha256") {
          const left = JSON.stringify(generated.draft.assetSha256 ?? {});
          const right = JSON.stringify(reference.draft.assetSha256 ?? {});
          if (left !== right && (generated.draft.assetSha256 || reference.draft.assetSha256)) fixedChanges.push(field);
        } else if (field === "offer") {
          if (normalizeText(generated.campaign.offer) !== normalizeText(reference.campaign.offer)) fixedChanges.push(field);
        } else if (field === "destinationUrl") {
          if (normalizeText(generated.campaign.destinationUrl) !== normalizeText(reference.campaign.destinationUrl)) fixedChanges.push(field);
        } else if (field === "actionLabel") {
          if (normalizeText(generated.campaign.actionLabel) !== normalizeText(reference.campaign.actionLabel)) fixedChanges.push(field);
        } else if (field === "productName") {
          if (normalizeText(generated.campaign.productName) !== normalizeText(reference.campaign.productName)) fixedChanges.push(field);
        } else if (field === "brandId") {
          if (generated.campaign.brandId !== reference.campaign.brandId) fixedChanges.push(field);
        } else {
          if (JSON.stringify(generated.campaign[field] ?? "") !== JSON.stringify(reference.campaign[field] ?? "")) fixedChanges.push(field);
        }
      }
      const headlineChanged = normalizeText(generated.draft.headline) !== normalizeText(reference.draft.headline);
      const ledeChanged = normalizeText(generated.draft.lede) !== normalizeText(reference.draft.lede);
      const headlineOverlap = jaccard(generated.draft.headline, reference.draft.headline);
      const intendedTerms = caseDef.expected.openingShift.openingTerms ?? caseDef.expected.draft.focusTerms ?? [];
      const angleFound = findPhrases([generated.draft.headline, generated.draft.lede].join(" "), intendedTerms);
      const sectionChanged =
        JSON.stringify((generated.draft.sections ?? []).map((section) => section.id)) !==
        JSON.stringify((reference.draft.sections ?? []).map((section) => section.id));
      const ok =
        fixedChanges.length === 0 &&
        headlineChanged &&
        ledeChanged &&
        headlineOverlap < 0.6 &&
        angleFound.length > 0 &&
        sectionChanged;
      comparisons.push(
        check(
          "opening-shift",
          ok ? "passed" : "failed",
          ok
            ? `The intent-change opening differs from ${reference.caseId} (headline overlap ${headlineOverlap}) while brand, product, offer, destination, and assets stay fixed.`
            : [
                fixedChanges.length ? `Fixed field(s) changed: ${fixedChanges.join(", ")}.` : "",
                !headlineChanged ? "The headline is unchanged." : "",
                !ledeChanged ? "The lede is unchanged." : "",
                headlineOverlap >= 0.6 ? `The headline is too close to the reference (overlap ${headlineOverlap}).` : "",
                angleFound.length === 0 ? `The opening lacks the new angle terms: ${intendedTerms.join(", ")}.` : "",
                !sectionChanged ? "Section emphasis is unchanged." : "",
              ].filter(Boolean).join(" "),
          {
            referenceCaseId: reference.caseId,
            fixedChanges,
            headlineChanged,
            ledeChanged,
            headlineOverlap,
            angleFound,
            sectionChanged,
          },
        ),
      );
    }
  }

  return comparisons;
}

export function summarize(checks) {
  const counts = { passed: 0, failed: 0, unassessed: 0 };
  for (const item of checks) counts[item.state] = (counts[item.state] ?? 0) + 1;
  return counts;
}

export function hardGateFailures(checks) {
  return checks.filter((item) => item.state === "failed" && HARD_GATES.has(item.id.replace(/^(?:before|after)\//, "")));
}

export function verifyPackUsability(loaded) {
  const { pack, fixturesDir, casesById } = loaded;
  const problems = [];
  const notes = [];

  // Baselines exist and are structurally usable.
  const baselineDir = path.join(fixturesDir, "baseline");
  const baseline = loadArtifacts(baselineDir);
  problems.push(...baseline.errors);
  for (const caseDef of pack.cases) {
    if (!baseline.drafts.has(caseDef.id)) problems.push(`baseline/${caseDef.id}.json is missing`);
  }

  // Generated samples exist for every case.
  const generatedDir = path.join(fixturesDir, "samples", "generated");
  const generated = loadArtifacts(generatedDir);
  problems.push(...generated.errors);
  for (const caseDef of pack.cases) {
    if (caseDef.role === "failure-revision") {
      if (!generated.revisions.has(caseDef.id)) problems.push(`samples/generated/${caseDef.id}.revision.json is missing`);
    } else if (!generated.drafts.has(caseDef.id)) {
      problems.push(`samples/generated/${caseDef.id}.json is missing`);
    }
  }

  // Samples are only useful if the expected results separate good from bad.
  for (const caseDef of pack.cases) {
    if (caseDef.role === "failure-revision") continue;
    const candidate = generated.drafts.get(caseDef.id);
    const base = baseline.drafts.get(caseDef.id);
    if (!candidate || !base) continue;
    const reference = caseDef.expected.differentFrom?.caseId
      ? generated.drafts.get(caseDef.expected.differentFrom.caseId)
      : caseDef.expected.openingShift?.referenceCaseId === "rich-angle"
        ? generated.drafts.get("rich-angle")
        : undefined;
    const candidateChecks = evaluateDraft(candidate, caseDef, pack);
    const comparison = compareArtifacts(candidate, base, reference, caseDef, pack);
    const failures = [...candidateChecks, ...comparison].filter((item) => item.state === "failed");
    if (caseDef.role === "trap") {
      const packaging = candidateChecks.find((item) => item.id === "packaging-truth");
      if (!packaging || packaging.state !== "unassessed") problems.push("trap case must report packaging truth as unassessed");
      const gateFailures = failures.filter((item) => HARD_GATES.has(item.id));
      if (gateFailures.length) problems.push(`trap sample has unexpected gate failure(s): ${gateFailures.map((item) => item.id).join(", ")}`);
    } else if (failures.length) {
      problems.push(`samples/generated/${caseDef.id}.json fails its own expected result: ${failures.map((item) => item.id).join(", ")}`);
    }
    notes.push(`${caseDef.id}: generated sample ${failures.length ? "fails" : "passes"} ${candidateChecks.length + comparison.length} checks (${[...candidateChecks, ...comparison].filter((item) => item.state === "unassessed").length} unassessed)`);
  }

  // Intent-change must fail when the opening is unchanged.
  const intentCase = casesById.get("intent-change");
  const unchanged = loadArtifacts(path.join(fixturesDir, "samples", "failures")).drafts.get("intent-change");
  if (intentCase && unchanged) {
    const checks = compareArtifacts(unchanged, baseline.drafts.get("intent-change"), generated.drafts.get("rich-angle"), intentCase, pack);
    if (!checks.some((item) => item.id === "opening-shift" && item.state === "failed")) {
      problems.push("samples/failures/intent-unchanged.json should fail the opening-shift check");
    }
  }

  // Revision sample must pass; stale sample must fail.
  const revisionCase = casesById.get("failure-revision");
  const revision = generated.revisions.get("failure-revision");
  if (revisionCase && revision) {
    const checks = evaluateRevision(revision, revisionCase, pack);
    const failures = checks.filter((item) => item.state === "failed");
    if (failures.length) problems.push(`good revision sample fails: ${failures.map((item) => item.id).join(", ")}`);
  }
  const stale = loadArtifacts(path.join(fixturesDir, "samples", "failures")).revisions.get("failure-revision");
  if (revisionCase && stale) {
    const checks = evaluateRevision(stale, revisionCase, pack);
    for (const id of ["revision-applied", "revision-old-values-absent", "revision-invalidates-approval"]) {
      if (!checks.some((item) => item.id === id && item.state === "failed")) {
        problems.push(`stale revision sample should fail ${id}`);
      }
    }
  }

  // Unsupported and missing-input samples must fail.
  const failureDir = path.join(fixturesDir, "samples", "failures");
  const failures = loadArtifacts(failureDir);
  const unsupported = failures.drafts.get("sparse-offer");
  if (unsupported) {
    const checks = evaluateDraft(unsupported, casesById.get("sparse-offer"), pack);
    if (!checks.some((item) => item.id === "claim-traceability" && item.state === "failed")) {
      problems.push("samples/failures/unsupported-claims.json should fail claim-traceability");
    }
  }
  const missing = failures.drafts.get("failure-revision");
  if (missing) {
    const checks = evaluateDraft(missing, casesById.get("failure-revision"), pack);
    if (!checks.some((item) => item.id === "input-required" && item.state === "failed")) {
      problems.push("samples/failures/missing-input.json should fail input-required");
    }
  }

  return { ok: problems.length === 0, problems, notes };
}

export function validatePack(loaded) {
  const { pack, fixturesDir, casesById } = loaded;
  const errors = [];
  const warnings = [];

  if (pack.schemaVersion !== 1) errors.push("pack.schemaVersion must be 1");
  if (!pack.packId) errors.push("pack.packId is required");
  if (!Array.isArray(pack.cases) || pack.cases.length < 4) errors.push("pack must contain at least four cases");

  const ids = new Set();
  for (const caseDef of pack.cases) {
    if (!/^[a-z0-9-]+$/.test(caseDef.id ?? "")) errors.push(`invalid case id: ${caseDef.id}`);
    if (ids.has(caseDef.id)) errors.push(`duplicate case id: ${caseDef.id}`);
    ids.add(caseDef.id);

    for (const field of ["brandId", "productName", "offer", "destinationUrl", "actionLabel", "productNoun"]) {
      if (!caseDef.campaign?.[field]) errors.push(`${caseDef.id}: campaign.${field} is required`);
    }
    if (!Array.isArray(caseDef.approvedFacts) || caseDef.approvedFacts.length === 0) errors.push(`${caseDef.id}: approvedFacts are required`);
    if (!Array.isArray(caseDef.approvedAssets) || caseDef.approvedAssets.length === 0) errors.push(`${caseDef.id}: approvedAssets are required`);
    if (!(caseDef.approvedAssets ?? []).some((asset) => asset.role === "product-hero")) {
      errors.push(`${caseDef.id}: at least one approved product-hero asset is required`);
    }
    for (const factId of caseDef.expected?.draft?.requiredFactIds ?? []) {
      if (!(caseDef.approvedFacts ?? []).some((fact) => fact.id === factId)) {
        errors.push(`${caseDef.id}: required fact ${factId} is not in approvedFacts`);
      }
    }

    for (const asset of caseDef.approvedAssets ?? []) {
      const file = resolveAssetFile(fixturesDir, asset);
      if (!existsSync(file)) {
        errors.push(`${caseDef.id}: asset file not found: ${asset.file}`);
        continue;
      }
      const digest = sha256(readFileSync(file));
      if (asset.sha256 && digest !== asset.sha256) {
        errors.push(`${caseDef.id}: asset ${asset.id} sha256 mismatch (expected ${asset.sha256}, observed ${digest})`);
      }
      if (!asset.alt || asset.alt.length < 20) warnings.push(`${caseDef.id}: asset ${asset.id} alt text is short`);
      if (!asset.role) errors.push(`${caseDef.id}: asset ${asset.id} role is required`);
    }

    const assetIds = new Set((caseDef.approvedAssets ?? []).map((asset) => asset.id));
    for (const asset of caseDef.approvedAssets ?? []) {
      if (!asset.sha256) errors.push(`${caseDef.id}: asset ${asset.id} must pin a SHA-256`);
    }
    for (const assetId of caseDef.mustStayExact?.assetIds ?? []) {
      if (!assetIds.has(assetId)) errors.push(`${caseDef.id}: mustStayExact references unknown asset ${assetId}`);
      const approved = (caseDef.approvedAssets ?? []).find((asset) => asset.id === assetId);
      const pinned = caseDef.mustStayExact?.assetSha256?.[assetId];
      if (approved && pinned !== approved.sha256) {
        errors.push(`${caseDef.id}: mustStayExact.assetSha256 for ${assetId} disagrees with the approved asset file`);
      }
    }
    if (caseDef.mustStayExact) {
      if (caseDef.mustStayExact.offer !== caseDef.campaign.offer) errors.push(`${caseDef.id}: mustStayExact.offer disagrees with campaign.offer`);
      if (caseDef.mustStayExact.destinationUrl !== caseDef.campaign.destinationUrl) errors.push(`${caseDef.id}: mustStayExact.destinationUrl disagrees with campaign.destinationUrl`);
      if (caseDef.mustStayExact.actionLabel !== caseDef.campaign.actionLabel) errors.push(`${caseDef.id}: mustStayExact.actionLabel disagrees with campaign.actionLabel`);
      if (caseDef.mustStayExact.productName !== caseDef.campaign.productName) errors.push(`${caseDef.id}: mustStayExact.productName disagrees with campaign.productName`);
    }

    if (!Array.isArray(caseDef.review?.["375"]) || caseDef.review["375"].length === 0) errors.push(`${caseDef.id}: review["375"] is required`);
    if (!Array.isArray(caseDef.review?.["1440"]) || caseDef.review["1440"].length === 0) errors.push(`${caseDef.id}: review["1440"] is required`);
    if (!Array.isArray(caseDef.proofBoundary?.automated) || caseDef.proofBoundary.automated.length === 0) errors.push(`${caseDef.id}: proofBoundary.automated is required`);
    if (!Array.isArray(caseDef.proofBoundary?.humanOnly) || caseDef.proofBoundary.humanOnly.length === 0) errors.push(`${caseDef.id}: proofBoundary.humanOnly is required`);
    if (!caseDef.fallback?.expected) errors.push(`${caseDef.id}: fallback.expected is required`);
  }

  const sparse = casesById.get("sparse-offer");
  const rich = casesById.get("rich-angle");
  const intent = casesById.get("intent-change");
  const failure = casesById.get("failure-revision");
  const trap = casesById.get("trap-asset-label");
  if (!sparse) errors.push("case sparse-offer is required");
  if (!rich) errors.push("case rich-angle is required");
  if (!intent) errors.push("case intent-change is required");
  if (!failure) errors.push("case failure-revision is required");
  if (!trap) errors.push("case trap-asset-label is required");

  if (sparse && rich) {
    for (const field of ["brandId", "productName", "offer", "destinationUrl", "actionLabel"]) {
      if (sparse.campaign[field] === rich.campaign[field]) warnings.push(`sparse-offer and rich-angle share ${field}; the richer case should be visibly different`);
    }
  }

  if (rich && intent) {
    for (const field of ["brandId", "productName", "offer", "destinationUrl", "actionLabel"]) {
      if (rich.campaign[field] !== intent.campaign[field]) errors.push(`intent-change must keep the same ${field} as rich-angle`);
    }
    const richAssets = new Set(rich.mustStayExact.assetIds);
    const intentAssets = new Set(intent.mustStayExact.assetIds);
    if (richAssets.size !== intentAssets.size || [...richAssets].some((id) => !intentAssets.has(id))) {
      errors.push("intent-change must keep the same asset IDs as rich-angle");
    }
    if (JSON.stringify(rich.mustStayExact.assetSha256) !== JSON.stringify(intent.mustStayExact.assetSha256)) {
      errors.push("intent-change must keep the same asset hashes as rich-angle");
    }
    if (rich.campaign.campaignAngle === intent.campaign.campaignAngle) errors.push("intent-change must use a different campaign angle from rich-angle");
  }

  if (failure) {
    if (!Array.isArray(failure.faults) || failure.faults.length < 3) errors.push("failure-revision must declare three faults");
    const revision = failure.expected?.revision;
    if (!revision?.from || !revision?.to) errors.push("failure-revision expected.revision.from and .to are required");
    if (!revision?.mustDisappear?.length) errors.push("failure-revision must list values that disappear in the revision");
    if (!revision?.mustAppear?.length) errors.push("failure-revision must list values that appear in the revision");
  }

  if (trap) {
    if (!trap.trap) errors.push("trap-asset-label must declare its trap metadata");
    if (trap.trap?.expectedAutomatedState !== "unassessed") errors.push("trap must expect an unassessed automated packaging check");
    if (!(trap.proofBoundary?.humanOnly ?? []).some((item) => /label/i.test(item))) errors.push("trap proofBoundary must require a human to read the label");
    if (!trap.trap?.visiblePackagingLabel || !trap.trap?.filenameImplies) errors.push("trap must record the filename implication and visible packaging label");
  }

  const usability = verifyPackUsability(loaded);
  errors.push(...usability.problems);

  return { ok: errors.length === 0, errors, warnings, notes: usability.notes };
}

export function buildBlindSheet({ loaded, runId, seed, pairs, captureRoot = "captures", capturesAvailable = false }) {
  const { pack } = loaded;
  const key = { schemaVersion: 1, runId, seed, cases: {} };
  const labels = ["A", "B", "C", "D"];
  const lines = [];

  lines.push("# Blind campaign review");
  lines.push("");
  lines.push(`Run: ${runId}`);
  lines.push("");
  lines.push("This sheet is blind. It does not say which draft came from the generator and which is the deterministic baseline.");
  lines.push("");
  lines.push("## How to score");
  lines.push("");
  lines.push("1. Open each draft's 375 px and 1440 px capture. Do not open `report.md`, `report.json`, or `blind-key.json` yet.");
  lines.push("2. Score each visual dimension from 0 to 2: 0 failed or unsupported, 1 workable with edits, 2 ready to use.");
  lines.push("3. Record the draft you would ship and whether you would fall back to the simpler/deterministic page.");
  lines.push("4. Only after all visual scores are recorded, open `report.md` and note factual or functional gate failures separately. Never average a gate failure into a visual score.");
  lines.push("");
  lines.push("Visual preferences are not factual failures. A draft can look better and still fail an exact offer, destination, asset, or claim check.");
  lines.push("");

  let includedCases = 0;
  pack.cases.forEach((caseDef) => {
    const pair = pairs.find((entry) => entry.caseId === caseDef.id);
    if (!pair) return;
    includedCases += 1;
    const orderSeed = sha256(`${seed}:${caseDef.id}`);
    const options = [...pair.options].sort((left, right) => {
      const leftKey = sha256(`${orderSeed}:${left.source}`);
      const rightKey = sha256(`${orderSeed}:${right.source}`);
      return leftKey.localeCompare(rightKey);
    });
    const mapping = {};
    lines.push(`## ${includedCases}. ${caseDef.title}`);
    lines.push("");
    lines.push(`**Campaign.** ${caseDef.campaign.brandName} · ${caseDef.campaign.productName} · ${caseDef.campaign.campaignAngle}`);
    lines.push("");
    if (caseDef.role === "failure-revision") {
      lines.push("**Compare.** The revised page with the last valid page. Approval behavior is in the gate report, not in the visual score.");
      lines.push("");
    }
    lines.push(`**Approved offer.** ${caseDef.campaign.offer} · **Destination.** ${caseDef.campaign.destinationUrl} · **Action.** ${caseDef.campaign.actionLabel}`);
    lines.push("");
    lines.push("**What a visitor should see at 375 px**");
    for (const item of caseDef.review["375"]) lines.push(`- ${item}`);
    lines.push("");
    lines.push("**What a visitor should see at 1440 px**");
    for (const item of caseDef.review["1440"]) lines.push(`- ${item}`);
    lines.push("");
    lines.push("| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    options.forEach((option, optionIndex) => {
      const label = labels[optionIndex];
      mapping[label] = { source: option.source, file: option.file ?? null, artifactCaseId: option.artifactCaseId ?? caseDef.id };
      lines.push(`| ${label} | | | | | | |`);
    });
    lines.push("");
    lines.push("Notes:");
    lines.push("");
    lines.push("- Which draft would you ship, and why?");
    lines.push("- Would you fall back to the other draft? Why?");
    lines.push("- Name one strength to preserve in each draft.");
    lines.push("");
    lines.push(capturesAvailable ? "Capture slots:" : "Capture slots (run `scripts/campaign-eval-browser.mjs` to fill them):");
    for (const label of Object.keys(mapping)) {
      lines.push(`- Draft ${label}: \`${captureRoot}/${caseDef.id}/${label}/375.png\`, \`${captureRoot}/${caseDef.id}/${label}/1440.png\``);
    }
    lines.push("");
    key.cases[caseDef.id] = { order: Object.keys(mapping), mapping };
  });

  lines.push("## Factual and functional gate review (complete after scoring)");
  lines.push("");
  lines.push("| Case | Gate | Result | Evidence |");
  lines.push("| --- | --- | --- | --- |");
  lines.push("| | | | |");
  lines.push("");
  lines.push("Gate results come from `report.md`. A gate failure is a release blocker, not a visual preference. A green automated check never proves that the pictured packaging is the approved product.");
  lines.push("");

  return { markdown: `${lines.join("\n")}\n`, key };
}
