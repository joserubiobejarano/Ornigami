#!/usr/bin/env node
/**
 * Qualification-only journal mutation helper.
 *
 * Reuses the runtime's canonical immutable-intent digest instead of copying the
 * algorithm into the shell journey. It deliberately creates a semantically
 * valid journal event with the same id and a recomputed digest, so the Linux
 * acceptance journey can prove that preserved prior commitments still reject
 * changed intent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

const input = option("--input");
const output = option("--output");
const index = Number.parseInt(option("--index") ?? "", 10);
const subject = option("--subject");
const effectAt = option("--effect-at");
if (!input || !output || !Number.isSafeInteger(index) || index < 0) {
  throw new Error("--input, --output and a non-negative --index are required");
}

const identity = await import(
  pathToFileURL(path.resolve("builder-runtime/lib/identity-store.ts")).href
);
const journal = JSON.parse(readFileSync(input, "utf8"));
const event = journal?.events?.[index];
if (!event) throw new Error(`journal event ${index} is missing`);

if (subject) {
  event.subjectId = subject;
  if (!event.effects?.subject) throw new Error("journal event has no effects subject");
  event.effects.subject.id = subject;
}
if (effectAt) event.effectAt = effectAt;

event.intentDigest = identity.computeBuilderMinimizationIntentDigest(
  identity.builderMinimizationIntentFromEvent(event),
);
writeFileSync(output, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
