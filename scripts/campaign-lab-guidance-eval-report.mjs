#!/usr/bin/env node
/**
 * Functional-gate report for the guidance evaluation. Uses the existing
 * campaign-eval-core checks and keeps them separate from human review.
 *
 * Usage:
 *   node scripts/campaign-lab-guidance-eval-report.mjs --run <run-dir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  compareDraftPair,
  evaluateDraft,
  hardGateFailures,
  loadPack,
  summarize,
} from "./campaign-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPack = path.join(
  root,
  "tests",
  "fixtures",
  "campaign-eval",
  "guidance-eval",
  "cases.json",
);
const { values: cli } = parseArgs({
  options: {
    run: { type: "string" },
    pack: { type: "string" },
    out: { type: "string" },
  },
});
if (!cli.run) throw new Error("--run is required");
const runDir = path.resolve(cli.run);
const packFile = path.resolve(cli.pack ?? defaultPack);
const outDir = path.resolve(cli.out ?? path.join(runDir, "functional"));
mkdirSync(outDir, { recursive: true });

const run = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8"));
const loaded = loadPack(packFile);
const { pack } = loaded;

function readArtifact(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

const deterministic = new Map();
for (const brief of run.preflight.briefs) {
  deterministic.set(
    brief.evalCaseId,
    readArtifact(
      path.join(
        runDir,
        "artifacts",
        "deterministic",
        `${brief.evalCaseId}.json`,
      ),
    ),
  );
}

const conditions = {};
for (const condition of ["A", "B"]) {
  conditions[condition] = {
    label: run.preflight.conditions[condition].label,
    repeats: {},
  };
  for (const repeat of [1, 2]) {
    const results = [];
    for (const caseDef of pack.cases) {
      const artifact = readArtifact(
        path.join(
          runDir,
          "artifacts",
          condition,
          `r${repeat}`,
          `${caseDef.id}.json`,
        ),
      );
      if (!artifact) {
        results.push({
          caseId: caseDef.id,
          missing: true,
        });
        continue;
      }
      const checks = evaluateDraft(artifact, caseDef, pack);
      const comparison = deterministic.get(caseDef.id)
        ? compareDraftPair(
            deterministic.get(caseDef.id),
            artifact,
            caseDef,
            pack,
          )
        : null;
      results.push({
        caseId: caseDef.id,
        artifact,
        summary: summarize(checks),
        hardFailures: hardGateFailures(checks).map((check) => check.id),
        checks,
        identicalToDeterministic: comparison?.identical ?? null,
        changes: comparison?.changes ?? [],
        comparisonChecks: comparison?.checks ?? [],
      });
    }
    conditions[condition].repeats[`r${repeat}`] = results;
  }
}

const requestSummary = run.records.map((record) => ({
  condition: record.condition,
  briefId: record.briefId,
  repeat: record.repeat,
  status: record.result?.generation?.status ?? "error",
  code: record.result?.generation?.code ?? null,
  latencyMs: record.latencyMs,
  promptTokens: record.usage?.prompt_tokens ?? null,
  completionTokens: record.usage?.completion_tokens ?? null,
  costUsd: record.costUsd,
}));

const report = {
  schemaVersion: 1,
  run: path.relative(root, runDir),
  pack: path.relative(root, packFile),
  model: run.model,
  conditions,
  requests: requestSummary,
};
writeFileSync(
  path.join(outDir, "functional-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

const lines = [
  "# Functional gate report",
  "",
  "These are template, identity, approval, and claim checks. They are not visual preferences and must not be averaged into human scores.",
  "",
  `- Model: ${run.model}`,
  `- Requests recorded: ${run.requestCount}`,
  `- Actual recorded cost: $${Number(run.spentUsd).toFixed(6)}`,
  "",
  "| Brief | Condition | Repeat | Status | Hard failures | Identical to deterministic | Layout | Sections | Facts |",
  "| --- | --- | ---: | --- | --- | --- | --- | --- | --- |",
];

for (const condition of ["A", "B"]) {
  for (const repeat of [1, 2]) {
    for (const result of conditions[condition].repeats[`r${repeat}`]) {
      if (result.missing) {
        lines.push(`| ${result.caseId} | ${condition} | ${repeat} | missing | — | — | — | — | — |`);
        continue;
      }
      const artifact = result.artifact;
      lines.push(
        `| ${result.caseId} | ${condition} | ${repeat} | ${artifact.flow?.generation?.status ?? "unknown"} | ${result.hardFailures.join(", ") || "none"} | ${result.identicalToDeterministic === null ? "unassessed" : result.identicalToDeterministic ? "yes" : "no"} | ${artifact.draft.layout} | ${artifact.draft.sections.map((section) => section.id).join(" → ")} | ${artifact.draft.facts.map((fact) => `${fact.label}: ${fact.value}`).join(", ") || "none"} |`,
      );
    }
  }
}

lines.push(
  "",
  "## Recorded response outcomes",
  "",
  "| Brief | Condition | Repeat | Status | Code | Latency ms | Prompt tokens | Completion tokens | Cost USD |",
  "| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |",
);
for (const request of requestSummary) {
  lines.push(
    `| ${request.briefId} | ${request.condition} | ${request.repeat} | ${request.status} | ${request.code ?? ""} | ${request.latencyMs} | ${request.promptTokens ?? ""} | ${request.completionTokens ?? ""} | ${Number(request.costUsd ?? 0).toFixed(6)} |`,
  );
}

const identicalCounts = { A: 0, B: 0, total: 0 };
for (const condition of ["A", "B"]) {
  for (const repeat of [1, 2]) {
    for (const result of conditions[condition].repeats[`r${repeat}`]) {
      if (result.missing) continue;
      identicalCounts.total += 1;
      if (result.identicalToDeterministic) identicalCounts[condition] += 1;
    }
  }
}
lines.push(
  "",
  "## Aggregate observations",
  "",
  `- Identical to deterministic: A ${identicalCounts.A}/6, B ${identicalCounts.B}/6.`,
  `- Hard-gate failures: A ${Object.values(conditions.A.repeats).flat().filter((item) => item.hardFailures?.length).length}, B ${Object.values(conditions.B.repeats).flat().filter((item) => item.hardFailures?.length).length}.`,
  "- Identical outputs, mixed results, and no improvement are valid outcomes.",
  "",
  "## Detailed changes",
  "",
);
for (const condition of ["A", "B"]) {
  lines.push(`### Condition ${condition}`, "");
  for (const repeat of [1, 2]) {
    for (const result of conditions[condition].repeats[`r${repeat}`]) {
      if (result.missing) continue;
      lines.push(
        `- **${result.caseId} r${repeat}:** ${result.changes.length ? result.changes.join(" ") : "No rendered change from the deterministic reference."}`,
      );
    }
  }
  lines.push("");
}
writeFileSync(path.join(outDir, "functional-report.md"), `${lines.join("\n")}\n`);
console.log(`Functional report: ${path.relative(root, outDir)}`);
console.log(
  JSON.stringify(
    {
      requests: requestSummary.length,
      identical: identicalCounts,
      hardFailures: {
        A: Object.values(conditions.A.repeats).flat().filter((item) => item.hardFailures?.length).length,
        B: Object.values(conditions.B.repeats).flat().filter((item) => item.hardFailures?.length).length,
      },
    },
    null,
    2,
  ),
);
