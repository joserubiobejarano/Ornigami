import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Portable defaults for the Campaign Lab browser checks. The synthetic asset is
 * committed with the repository, so the default run does not depend on a local
 * machine path or a real brand package.
 */
export const SYNTHETIC_OFFER_FIXTURE = {
  packshot: "tests/fixtures/campaign-lab/pilots/shared/review-use.png",
  expected: {
    fileName: "review-use.png",
    width: 1600,
    height: 1000,
    hash: "49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2",
  },
  brief: {
    brandName: "Harbor Field",
    productName: "Harbor Field bottle",
    offer: "Free shipping through 30 November 2026, on every order",
    destinationUrl: "https://example.com/harbor-field",
    facts: [
      { label: "Material", value: "Recycled glass" },
      { label: "Capacity", value: "750 ml" },
    ],
    alt: "Synthetic Harbor Field bottle on a plain background.",
    rights: "Synthetic fixture for local UI checks only.",
  },
  continuous: {
    initialOffer: "Free shipping through 30 November 2026 — on every order",
    correctedOffer: "Free shipping through 30 November 2026, on every order",
  },
};

function text(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function facts(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("brief.facts must be a non-empty array");
  }
  return value.map((fact, index) => ({
    label: text(fact?.label, `brief.facts[${index}].label`),
    value: text(fact?.value, `brief.facts[${index}].value`),
  }));
}

function normalize(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("The inputs file must contain one JSON object");
  }
  const expected = input.expected ?? {};
  const brief = input.brief ?? {};
  const continuous = input.continuous ?? {};
  return {
    packshot: text(input.packshot, "packshot"),
    expected: {
      fileName:
        typeof expected.fileName === "string"
          ? expected.fileName
          : path.basename(text(input.packshot, "packshot")),
      width: positiveInteger(expected.width, "expected.width"),
      height: positiveInteger(expected.height, "expected.height"),
      hash: text(expected.hash, "expected.hash").toLowerCase(),
    },
    brief: {
      brandName: text(brief.brandName, "brief.brandName"),
      productName: text(brief.productName, "brief.productName"),
      offer: text(brief.offer, "brief.offer"),
      destinationUrl: text(brief.destinationUrl, "brief.destinationUrl"),
      facts: facts(brief.facts),
      alt: text(brief.alt, "brief.alt"),
      rights: text(brief.rights, "brief.rights"),
    },
    continuous: {
      initialOffer: text(
        continuous.initialOffer ?? brief.offer,
        "continuous.initialOffer",
      ),
      correctedOffer: text(
        continuous.correctedOffer ?? brief.offer,
        "continuous.correctedOffer",
      ),
    },
  };
}

/**
 * Loads the synthetic fixture, or an explicit JSON file from Git-ignored local
 * storage. The source file is never written to the report; only the supplied
 * relative path is retained for local evidence.
 */
export function loadOfferFixture({ inputs, root = process.cwd() } = {}) {
  let source = "synthetic";
  let data = SYNTHETIC_OFFER_FIXTURE;

  if (inputs) {
    const inputsPath = path.resolve(root, inputs);
    if (!existsSync(inputsPath)) {
      throw new Error(`Inputs file not found: ${inputs}`);
    }
    data = normalize(JSON.parse(readFileSync(inputsPath, "utf8")));
    source = inputs;
  }

  const packshot = path.resolve(root, data.packshot);
  if (!existsSync(packshot)) {
    throw new Error(`Packshot not found: ${data.packshot}`);
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(packshot))
    .digest("hex");

  return {
    source,
    packshot,
    packshotFileName: path.basename(packshot),
    expected: {
      ...data.expected,
      fileName: data.expected.fileName || path.basename(packshot),
    },
    brief: data.brief,
    continuous: data.continuous,
    actualHash,
  };
}
