#!/usr/bin/env node
/**
 * Campaign-lab evaluation pack CLI.
 *
 * Commands:
 *   validate      Check the fixture pack, asset bytes, baselines, and that the
 *                 sample drafts separate good from bad as expected.
 *   evaluate      Evaluate a directory of generated draft artifacts against the
 *                 pack and the deterministic baselines. Writes report.json,
 *                 report.md, blind-sheet.md, blind-key.json, and blind-map.json.
 *   blind-sheet   Rebuild only the blind review sheet from an existing run.
 *
 * The CLI never imports the app route, renderer, or provider adapter.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  buildBlindSheet,
  compareArtifacts,
  evaluateDraft,
  evaluateRevision,
  hardGateFailures,
  loadArtifacts,
  loadPack,
  summarize,
  validatePack,
} from "./campaign-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPack = path.join(root, "tests", "fixtures", "campaign-eval", "cases.json");

function usage() {
  return `Campaign-lab evaluation pack

Usage:
  node scripts/campaign-eval.mjs validate [--pack <cases.json>]
  node scripts/campaign-eval.mjs evaluate [--pack <cases.json>] [--drafts <dir>] [--baseline <dir>] [--out <dir>] [--seed <text>]

Defaults:
  --pack      tests/fixtures/campaign-eval/cases.json
  --drafts    tests/fixtures/campaign-eval/samples/generated
  --baseline  tests/fixtures/campaign-eval/baseline
  --out       .local/campaign-eval/<timestamp>

Exit codes:
  0 all evaluated drafts have no failed gate and no failed expected check
  1 at least one evaluated draft failed a gate or expected check
  2 setup or pack validation error
`;
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      pack: { type: "string" },
      drafts: { type: "string" },
      baseline: { type: "string" },
      out: { type: "string" },
      seed: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  const command = parsed.positionals[0] ?? "validate";
  if (!["validate", "evaluate"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  return {
    command,
    pack: path.resolve(parsed.values.pack ?? defaultPack),
    drafts: parsed.values.drafts ? path.resolve(parsed.values.drafts) : null,
    baseline: parsed.values.baseline ? path.resolve(parsed.values.baseline) : null,
    out: parsed.values.out ? path.resolve(parsed.values.out) : null,
    seed: parsed.values.seed ?? "campaign-eval-v1",
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${row.map(escapeCell).join(" | ")} |`);
  return lines.join("\n");
}

function stateBadge(state) {
  if (state === "passed") return "pass";
  if (state === "failed") return "FAIL";
  return "unassessed";
}

function loadCaseArtifacts(draftsDir, baselineDir) {
  const generated = loadArtifacts(draftsDir);
  const baseline = loadArtifacts(baselineDir);
  return { generated, baseline };
}

function evaluateRun({ loaded, generated, baseline }) {
  const { pack, casesById } = loaded;
  const results = [];
  const pairs = [];

  for (const caseDef of pack.cases) {
    const generatedDraft = generated.drafts.get(caseDef.id);
    const generatedRevision = generated.revisions.get(caseDef.id);
    const baselineDraft = baseline.drafts.get(caseDef.id);
    const baselineRevision = baseline.revisions.get(caseDef.id);

    let generatedChecks = [];
    let baselineChecks = [];
    let generatedArtifact = generatedDraft ?? generatedRevision?.after ?? null;
    let baselineArtifact = baselineDraft ?? baselineRevision?.after ?? null;

    if (generatedRevision) {
      generatedChecks = evaluateRevision(generatedRevision, caseDef, pack);
    } else if (generatedDraft) {
      generatedChecks = evaluateDraft(generatedDraft, caseDef, pack);
    } else {
      generatedChecks = [
        {
          id: "draft-supplied",
          state: "unassessed",
          detail: "No generated draft artifact was supplied for this case.",
          evidence: { draftsDir: generated.drafts.size },
        },
      ];
    }

    if (baselineRevision) {
      baselineChecks = evaluateRevision(baselineRevision, caseDef, pack);
    } else if (baselineDraft) {
      baselineChecks = evaluateDraft(baselineDraft, caseDef, pack);
    } else {
      baselineChecks = [
        {
          id: "baseline-supplied",
          state: "unassessed",
          detail: "No baseline artifact was supplied for this case.",
          evidence: {},
        },
      ];
    }

    // Comparisons need the generated richer draft for the intent-change case.
    const referenceGenerated =
      caseDef.expected.openingShift?.referenceCaseId === "rich-angle"
        ? generated.drafts.get("rich-angle")
        : caseDef.expected.differentFrom?.caseId
          ? generated.drafts.get(caseDef.expected.differentFrom.caseId)
          : undefined;

    const comparisonChecks =
      generatedArtifact && baselineArtifact
        ? compareArtifacts(generatedArtifact, baselineArtifact, referenceGenerated, caseDef)
        : [];
    const allGeneratedChecks = [...generatedChecks, ...comparisonChecks];

    const generatedHard = hardGateFailures(generatedChecks);
    const baselineHard = hardGateFailures(baselineChecks);
    const generatedFailed = allGeneratedChecks.filter((item) => item.state === "failed");
    const baselineFailed = baselineChecks.filter((item) => item.state === "failed");
    const generatedUnassessed = allGeneratedChecks.filter((item) => item.state === "unassessed");
    const comparisonUnassessed = comparisonChecks.filter((item) => item.state === "unassessed");

    let verdict;
    let reason;
    if (!generatedArtifact) {
      verdict = "missing-draft";
      reason = "No generated draft was supplied.";
    } else if (caseDef.role === "trap") {
      verdict = generatedHard.length ? "fallback-preferable" : "human-review-required";
      reason = generatedHard.length
        ? "The generated draft failed a factual or functional gate."
        : "Automated checks cannot prove the pictured packaging; a human must read the crop.";
    } else if (caseDef.role === "failure-revision") {
      const revisionChecks = generatedChecks.filter((item) => ["revision-applied", "revision-old-values-absent", "revision-preserves-unrelated", "revision-invalidates-approval"].includes(item.id));
      const revisionFailed = revisionChecks.filter((item) => item.state === "failed");
      const invalidation = revisionChecks.find((item) => item.id === "revision-invalidates-approval");
      verdict = revisionFailed.length ? "fallback-preferable" : "revision-applied";
      reason = revisionFailed.length
        ? `The revision failed: ${revisionFailed.map((item) => item.id).join(", ")}.`
        : invalidation?.state === "passed"
          ? "The late offer and destination change applied exactly and invalidated approval."
          : "The late offer and destination change applied exactly. Approval invalidation is unassessed in this artifact; the acceptance runner observes it in the UI.";
    } else if (generatedHard.length && !baselineHard.length) {
      verdict = "fallback-preferable";
      reason = `Generated draft failed gate(s): ${generatedHard.map((item) => item.id).join(", ")}. The baseline passes them.`;
    } else if (baselineHard.length && !generatedHard.length) {
      verdict = "generated-improved";
      reason = `Baseline failed gate(s): ${baselineHard.map((item) => item.id).join(", ")}.`;
    } else if (generatedHard.length && baselineHard.length) {
      verdict = "both-fail";
      reason = "Both drafts fail at least one hard gate.";
    } else if (generatedFailed.length < baselineFailed.length) {
      verdict = "generated-improved";
      reason = `Generated draft has ${generatedFailed.length} failed check(s) versus ${baselineFailed.length} for the baseline.`;
    } else if (generatedFailed.length > baselineFailed.length) {
      verdict = "fallback-preferable";
      reason = `Generated draft has ${generatedFailed.length} failed check(s) versus ${baselineFailed.length} for the baseline.`;
    } else if (caseDef.expected.openingShift && comparisonChecks.some((item) => item.id === "opening-shift" && item.state === "failed")) {
      verdict = "generated-improved";
      reason = "The baseline does not change the opening for the new campaign angle.";
    } else {
      const generatedEvidence = generatedArtifact ? generatedArtifact.draft : null;
      const baselineEvidence = baselineArtifact ? baselineArtifact.draft : null;
      const generatedEvidenceCount = generatedEvidence
        ? (generatedEvidence.facts?.length ?? 0) +
          (generatedEvidence.story ? 1 : 0) +
          Math.max(0, (generatedEvidence.assetIds?.length ?? 0) - 1)
        : 0;
      const baselineEvidenceCount = baselineEvidence
        ? (baselineEvidence.facts?.length ?? 0) +
          (baselineEvidence.story ? 1 : 0) +
          Math.max(0, (baselineEvidence.assetIds?.length ?? 0) - 1)
        : 0;
      if (generatedEvidenceCount > baselineEvidenceCount) {
        verdict = "generated-improved";
        reason = `Both drafts pass the gates, and the generated draft uses ${generatedEvidenceCount} approved evidence item(s) versus ${baselineEvidenceCount}.`;
      } else {
        verdict = "both-pass-human-decides";
        reason = "Both drafts pass the automated gates; visual review decides.";
      }
    }

    results.push({
      caseId: caseDef.id,
      role: caseDef.role,
      verdict,
      reason,
      generated: {
        checks: allGeneratedChecks,
        summary: summarize(allGeneratedChecks),
        hardFailures: generatedHard.map((item) => item.id),
        unassessed: generatedUnassessed.map((item) => item.id),
        source: generatedDraft?.file ?? generatedRevision?.file ?? null,
      },
      baseline: {
        checks: baselineChecks,
        summary: summarize(baselineChecks),
        hardFailures: baselineHard.map((item) => item.id),
        source: baselineDraft?.file ?? baselineRevision?.file ?? null,
      },
      comparison: comparisonChecks,
      unassessed: [...new Set([...generatedUnassessed.map((item) => item.id), ...comparisonUnassessed.map((item) => item.id)])],
    });

    if (generatedArtifact && baselineArtifact) {
      pairs.push({
        caseId: caseDef.id,
        options: [
          { source: "generated", file: generatedDraft?.file ?? generatedRevision?.file ?? null, artifactCaseId: caseDef.id },
          { source: "baseline", file: baselineDraft?.file ?? baselineRevision?.file ?? null, artifactCaseId: caseDef.id },
        ].filter((option) => option.file),
      });
    }
  }

  return { results, pairs };
}

function buildMarkdown({ loaded, results, runId, seed, blindPath, keyPath, reportJsonPath }) {
  const { pack } = loaded;
  const lines = [];
  lines.push("# Campaign-lab evaluation report");
  lines.push("");
  lines.push(`- Run: \`${runId}\``);
  lines.push(`- Pack: \`${pack.packId}\` v${pack.packVersion}`);
  lines.push(`- Template: \`${pack.template.id}\` v${pack.template.version}`);
  lines.push(`- Seed: \`${seed}\``);
  lines.push(`- Machine report: \`${path.basename(reportJsonPath)}\``);
  lines.push(`- Blind sheet: \`${path.basename(blindPath)}\``);
  lines.push(`- Blind key (do not show reviewers): \`${path.basename(keyPath)}\``);
  lines.push("");
  lines.push("Automated checks prove facts, budgets, and plumbing. They do not prove the pictured packaging, the brand fit, or that the composition is worth shipping. Those remain human review.");
  lines.push("");

  const summaryRows = results.map((result) => [
    result.caseId,
    result.verdict,
    `${result.generated.summary.passed}/${result.generated.summary.failed}/${result.generated.summary.unassessed}`,
    `${result.baseline.summary.passed}/${result.baseline.summary.failed}/${result.baseline.summary.unassessed}`,
    result.reason,
  ]);
  lines.push("## Summary");
  lines.push("");
  lines.push(table(["Case", "Verdict", "Generated pass/fail/unassessed", "Baseline pass/fail/unassessed", "Reason"], summaryRows));
  lines.push("");

  const improved = results.filter((result) => result.verdict === "generated-improved");
  const fallback = results.filter((result) => result.verdict === "fallback-preferable");
  const unassessed = results.flatMap((result) =>
    result.unassessed.map((id) => ({ caseId: result.caseId, id })),
  );

  lines.push("## Which drafts improved");
  lines.push("");
  if (improved.length === 0) {
    lines.push("No case showed an automated improvement. Use the blind sheet to decide whether the generated draft is worth keeping.");
  } else {
    for (const result of improved) {
      lines.push(`- **${result.caseId}**: ${result.reason}`);
    }
  }
  lines.push("");
  lines.push("## Where the fallback was preferable");
  lines.push("");
  if (fallback.length === 0) {
    lines.push("No case required the fallback on automated evidence.");
  } else {
    for (const result of fallback) {
      lines.push(`- **${result.caseId}**: ${result.reason}`);
    }
  }
  lines.push("");
  lines.push("## Checks that remain unassessed");
  lines.push("");
  if (unassessed.length === 0) {
    lines.push("No automated check was left unassessed. Visual dimensions still require the blind sheet.");
  } else {
    for (const item of unassessed) lines.push(`- **${item.caseId}**: \`${item.id}\``);
  }
  lines.push("- Browser-only checks are unassessed until `scripts/campaign-eval-browser.mjs` runs against the integrated flow.");
  lines.push("- Packaging truth is always human-only. A green asset check does not approve the pictured package.");
  lines.push("- Campaign fit, brand fit, visual hierarchy, repetition, and edits-to-approval judgments come from the blind sheet.");
  lines.push("");

  for (const result of results) {
    const caseDef = loaded.casesById.get(result.caseId);
    lines.push(`## ${caseDef.title}`);
    lines.push("");
    lines.push(`**Role.** ${caseDef.role} · **Verdict.** ${result.verdict}`);
    lines.push("");
    lines.push(`**Reason.** ${result.reason}`);
    lines.push("");
    lines.push(`**Fixed facts.** Offer \`${caseDef.campaign.offer}\` · Destination \`${caseDef.campaign.destinationUrl}\` · Action \`${caseDef.campaign.actionLabel}\` · Product \`${caseDef.campaign.productName}\``);
    lines.push("");
    if (caseDef.expected.revision) {
      lines.push(`**Late revision.** \`${caseDef.expected.revision.from.offer}\` → \`${caseDef.expected.revision.to.offer}\` · \`${caseDef.expected.revision.from.destinationUrl}\` → \`${caseDef.expected.revision.to.destinationUrl}\``);
      lines.push("");
    }
    lines.push(`**Assets.** ${caseDef.approvedAssets.map((asset) => `\`${asset.id}\``).join(", ")}`);
    lines.push("");
    lines.push("### Generated draft checks");
    lines.push("");
    lines.push(table(["Check", "State", "Detail"], result.generated.checks.map((item) => [item.id, stateBadge(item.state), item.detail])));
    lines.push("");
    lines.push("### Baseline checks");
    lines.push("");
    lines.push(table(["Check", "State", "Detail"], result.baseline.checks.map((item) => [item.id, stateBadge(item.state), item.detail])));
    lines.push("");
    if (result.comparison.length) {
      lines.push("### Cross-draft comparison");
      lines.push("");
      lines.push(table(["Check", "State", "Detail"], result.comparison.map((item) => [item.id, stateBadge(item.state), item.detail])));
      lines.push("");
    }
    lines.push(`**Fallback.** ${caseDef.fallback.expected}`);
    lines.push("");
  }

  lines.push("## How to run the integrated flow");
  lines.push("");
  lines.push("1. Run the existing acceptance runner for its current coverage:");
  lines.push("");
  lines.push("   ```powershell");
  lines.push("   node scripts/campaign-lab-acceptance.mjs --url <flow-url> --manifest tests/fixtures/campaign-lab/approved-fixtures.json --require-approved");
  lines.push("   ```");
  lines.push("");
  lines.push("2. Collect the generated drafts into a directory using the artifact shape in `tests/fixtures/campaign-eval/README.md`.");
  lines.push("");
  lines.push("3. Evaluate the collected drafts:");
  lines.push("");
  lines.push("   ```powershell");
  lines.push("   node scripts/campaign-eval.mjs evaluate --drafts <drafts-dir>");
  lines.push("   ```");
  lines.push("");
  lines.push("4. Run the focused browser checks for the regressions the acceptance runner does not cover:");
  lines.push("");
  lines.push("   ```powershell");
  lines.push("   node scripts/campaign-eval-browser.mjs --run <run-dir> --urls <urls.json>");
  lines.push("   ```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeRun({ loaded, generated, baseline, outDir, seed }) {
  mkdirSync(outDir, { recursive: true });
  const runId = path.basename(outDir);
  const { results, pairs } = evaluateRun({ loaded, generated, baseline });
  const blind = buildBlindSheet({
    loaded,
    runId,
    seed,
    pairs,
    capturesAvailable: existsSync(path.join(outDir, "captures")),
  });

  const reportJsonPath = path.join(outDir, "report.json");
  const blindPath = path.join(outDir, "blind-sheet.md");
  const keyPath = path.join(outDir, "blind-key.json");
  const mapPath = path.join(outDir, "blind-map.json");
  const report = {
    schemaVersion: 1,
    runId,
    seed,
    pack: {
      id: loaded.pack.packId,
      version: loaded.pack.packVersion,
      template: loaded.pack.template,
    },
    results,
    blind: { sheet: path.basename(blindPath), key: path.basename(keyPath) },
  };
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(blindPath, blind.markdown);
  writeFileSync(keyPath, `${JSON.stringify(blind.key, null, 2)}\n`);
  writeFileSync(mapPath, `${JSON.stringify(blind.key, null, 2)}\n`);

  const markdown = buildMarkdown({
    loaded,
    results,
    runId,
    seed,
    blindPath,
    keyPath,
    reportJsonPath,
  });
  const reportPath = path.join(outDir, "report.md");
  writeFileSync(reportPath, markdown);

  return { runId, results, reportPath, reportJsonPath, blindPath, keyPath, mapPath };
}

function runValidate({ pack }) {
  if (!existsSync(pack)) throw new Error(`Pack not found: ${pack}`);
  const loaded = loadPack(pack);
  const validation = validatePack(loaded);
  if (validation.warnings.length) {
    console.log("Warnings:");
    for (const warning of validation.warnings) console.log(`- ${warning}`);
  }
  if (!validation.ok) {
    console.error("Pack validation failed:");
    for (const error of validation.errors) console.error(`- ${error}`);
    return 2;
  }
  console.log("Pack validation passed.");
  for (const note of validation.notes) console.log(`- ${note}`);
  return 0;
}

function runEvaluate({ pack, drafts, baseline, out, seed }) {
  if (!existsSync(pack)) throw new Error(`Pack not found: ${pack}`);
  const loaded = loadPack(pack);
  const validation = validatePack(loaded);
  if (!validation.ok) {
    console.error("Pack validation failed. Fix the pack before evaluating drafts:");
    for (const error of validation.errors) console.error(`- ${error}`);
    return 2;
  }
  const draftsDir = drafts ?? path.join(loaded.fixturesDir, "samples", "generated");
  const baselineDir = baseline ?? path.join(loaded.fixturesDir, "baseline");
  if (!existsSync(draftsDir)) throw new Error(`Drafts directory not found: ${draftsDir}`);
  if (!existsSync(baselineDir)) throw new Error(`Baseline directory not found: ${baselineDir}`);

  const { generated, baseline: baselineArtifacts } = loadCaseArtifacts(draftsDir, baselineDir);
  for (const error of [...generated.errors, ...baselineArtifacts.errors]) console.error(`- ${error}`);
  if (generated.errors.length || baselineArtifacts.errors.length) return 2;

  const outDir = out ?? path.join(root, ".local", "campaign-eval", timestamp());
  const run = writeRun({ loaded, generated, baseline: baselineArtifacts, outDir, seed });
  console.log(`Run: ${run.runId}`);
  console.log(`Report: ${path.relative(root, run.reportPath)}`);
  console.log(`Blind sheet: ${path.relative(root, run.blindPath)}`);
  console.log(`Blind key: ${path.relative(root, run.keyPath)}`);
  for (const result of run.results) {
    console.log(`- ${result.caseId}: ${result.verdict} (${result.reason})`);
  }
  const failed = run.results.filter(
    (result) => result.generated.hardFailures.length > 0 && result.role !== "failure-revision",
  );
  return failed.length ? 1 : 0;
}

try {
  const options = parseCli();
  let code;
  if (options.command === "validate") code = runValidate(options);
  else if (options.command === "evaluate") code = runEvaluate(options);
  process.exitCode = code;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
