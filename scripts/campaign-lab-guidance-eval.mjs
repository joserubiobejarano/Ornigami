#!/usr/bin/env node
/**
 * Blinded A/B evaluation of the current Ornigami advisory guidance pack.
 *
 * A: full campaign context and hard constraints, no advisory rules.
 * B: identical request with the current advisory rules.
 *
 * `preflight` is offline. `run` requires --execute and an explicit --cap-usd.
 * No retries or reruns are performed by this runner.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createOpenAIClient } from "../src/lib/openai-config.ts";
import { BASE_CATALOG } from "../src/lib/campaign-lab/fixtures.ts";
import {
  buildCampaignPreview,
  assemblePlannedDraft,
} from "../src/lib/campaign-lab/template.ts";
import {
  buildRuntimeGuidance,
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "../src/lib/campaign-lab/generation/guidance/pack.ts";
import { OpenAIGenerationTransport } from "../src/lib/campaign-lab/generation/openai-transport.ts";
import { accountProviderUsage } from "../src/lib/campaign-lab/generation/provider-accounting.ts";
import {
  redactDiagnosticText,
  shouldStopAfterFailure,
} from "../src/lib/campaign-lab/generation/provider-diagnostics.ts";
import { buildOpenAIMessages } from "../src/lib/campaign-lab/generation/prompt.ts";
import {
  resolveGenerationProvider,
  resolveGenerationTimeoutMs,
} from "../src/lib/campaign-lab/generation/provider-config.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import { validateGenerationProposal } from "../src/lib/campaign-lab/generation/validate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPack = path.join(
  root,
  "tests",
  "fixtures",
  "campaign-eval",
  "guidance-eval",
  "briefs.json",
);
const MAX_PAID_REQUESTS = 12;
const REPEATS = 2;
const OUTPUT_TOKEN_BOUND = 300;
const PRICING = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

function usage() {
  return `Campaign Lab guidance evaluation

Usage:
  node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs preflight [--out <dir>] [--model <id>]
  node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs run --execute --cap-usd <amount> [--env-file <.env.local>] [--out <dir>] [--model <id>]
  node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs canary [--out <dir>] [--model <id>] [--env-file <.env.local>]
  node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs canary --execute --cap-usd <amount> [--env-file <.env.local>] [--out <dir>] [--model <id>]

Options:
  --pack <file>          Frozen brief pack
  --out <dir>            Evidence directory (default: .local/campaign-lab-guidance-eval/<timestamp>)
  --model <id>           Model (default: CAMPAIGN_LAB_GENERATION_MODEL or gpt-4o-mini)
  --cap-usd <amount>     Hard total spend cap for this run
  --env-file <file>      Local env file loaded in-memory; values are never printed
  --execute              Required for paid calls
  --overwrite            Allow a run into an existing evidence directory
`;
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      pack: { type: "string" },
      out: { type: "string" },
      model: { type: "string" },
      "cap-usd": { type: "string" },
      "env-file": { type: "string" },
      execute: { type: "boolean", default: false },
      overwrite: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  const command = parsed.positionals[0] ?? "preflight";
  if (!["preflight", "run", "canary"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
  return {
    command,
    pack: path.resolve(parsed.values.pack ?? defaultPack),
    out: path.resolve(
      parsed.values.out ??
        path.join(
          root,
          ".local",
          command === "canary"
            ? "campaign-lab-live-canary"
            : "campaign-lab-guidance-eval",
          stamp,
        ),
    ),
    model:
      parsed.values.model ??
      process.env.CAMPAIGN_LAB_GENERATION_MODEL?.trim() ??
      "gpt-4o-mini",
    capUsd:
      parsed.values["cap-usd"] !== undefined
        ? Number(parsed.values["cap-usd"])
        : null,
    envFile: parsed.values["env-file"]
      ? path.resolve(parsed.values["env-file"])
      : null,
    execute: parsed.values.execute,
    overwrite: parsed.values.overwrite,
  };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function money(value) {
  return `$${value.toFixed(6)}`;
}

function loadEnvFile(file) {
  if (!file) return {};
  if (!existsSync(file)) throw new Error(`Env file not found: ${file}`);
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function mergedEnv(fileEnv) {
  return { ...fileEnv, ...process.env };
}

function conditionGuidance(condition) {
  return async (context) => {
    const base = buildRuntimeGuidance(context);
    if (condition === "B") return base;
    return {
      ...base,
      advisory: {
        ...base.advisory,
        rules: [],
      },
    };
  };
}

function factSubsets(factIds, min, max) {
  const output = [];
  const visit = (index, selected) => {
    if (selected.length > max) return;
    if (index === factIds.length) {
      if (selected.length >= min) output.push([...selected]);
      return;
    }
    visit(index + 1, selected);
    selected.push(factIds[index]);
    visit(index + 1, selected);
    selected.pop();
  };
  visit(0, []);
  return output;
}

function enumeratePlans(request) {
  const plans = [];
  for (const angle of request.allowed.angles) {
    for (const layout of request.allowed.layouts) {
      const capacity = request.allowed.layoutFactCapacity[layout];
      for (const order of request.allowed.sectionOrders[layout]) {
        const hasFacts = order.includes("hero-facts") || order.includes("detail");
        const maxFacts = Math.min(request.allowed.maxFacts, capacity);
        const subsets = factSubsets(
          request.allowed.factIds,
          hasFacts ? 1 : 0,
          hasFacts ? maxFacts : 0,
        );
        for (const factIds of subsets) {
          const requiredComplete = request.allowed.requiredFactGroups.every(
            (group) => group.factIds.every((id) => factIds.includes(id)),
          );
          if (!requiredComplete) continue;
          const plan = {
            angle,
            layout,
            sections: [...order],
            factIds,
          };
          if (validateGenerationProposal(plan, request).ok) plans.push(plan);
        }
      }
    }
  }
  return plans;
}

function firstPlan(request) {
  const plans = enumeratePlans(request);
  if (!plans.length) throw new Error("The brief has no valid template plan.");
  return plans[0];
}

async function capturedRequest(brief, condition) {
  let request = null;
  const provider = {
    id: "capture",
    label: "Capture provider",
    async generate(next) {
      request = next;
      return firstPlan(next);
    },
  };
  const fixture = BASE_CATALOG.fixtures[brief.fixtureId];
  if (!fixture) throw new Error(`Unknown fixture: ${brief.fixtureId}`);
  const result = await runCampaignGeneration(
    { fixtureId: brief.fixtureId, values: brief.values },
    {
      catalog: BASE_CATALOG,
      provider,
      guidanceLoader: conditionGuidance(condition),
    },
  );
  if (!result.ok) {
    throw new Error(
      `${brief.id}/${condition}: deterministic validation failed: ${JSON.stringify(result.issues)}`,
    );
  }
  if (!request) throw new Error(`${brief.id}/${condition}: request was not captured`);
  return { request, result };
}

function promptStats(request) {
  const messages = buildOpenAIMessages(request);
  const chars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const utf8Bytes = messages.reduce(
    (sum, message) => sum + Buffer.byteLength(message.content, "utf8"),
    0,
  );
  // One token per UTF-8 byte is deliberately conservative. The extra framing
  // allowance covers role/message separators and request metadata.
  const messageFramingBytes = messages.length * 32 + 128;
  const estimatedTokens = Math.ceil(chars / 4);
  const conservativeTokens = utf8Bytes + messageFramingBytes;
  return {
    chars,
    utf8Bytes,
    messageFramingBytes,
    estimatedTokens,
    conservativeTokens,
    messages,
  };
}

function requestCost(tokens, model, outputTokens) {
  const price = PRICING[model];
  if (!price) {
    throw new Error(
      `No pricing entry for model "${model}". Add it to PRICING before execution.`,
    );
  }
  return (
    (tokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}

function artifactFromPreview(caseId, preview, generation, source, sourceLabel) {
  return {
    schemaVersion: 1,
    caseId,
    source,
    sourceLabel,
    template: {
      id: preview.draft.templateId,
      version: preview.draft.templateVersion,
    },
    campaign: {
      brandId: preview.brief.brandId,
      productName: preview.brief.productName,
      offer: preview.brief.offer,
      destinationUrl: preview.brief.destinationUrl,
      actionLabel: preview.brief.actionLabel,
    },
    draft: {
      layout: preview.draft.layout,
      headline: preview.draft.headline,
      lede: preview.draft.lede,
      facts: preview.draft.facts.map((fact) => ({
        label: fact.label,
        value: fact.value,
      })),
      sections: preview.draft.sections.map((section, index) => ({
        id: section,
        heading: "",
        emphasis: index + 1,
      })),
      assetIds: [preview.asset.id],
      claims: [preview.draft.headline, preview.draft.lede].filter(Boolean),
    },
    approval: {
      state: "unknown",
      revision: preview.revision,
    },
    flow: {
      generation,
      revision: preview.revision,
      asset: {
        id: preview.asset.id,
        src: preview.asset.src,
        alt: preview.asset.alt,
        contentHash: preview.asset.contentHash,
      },
      brief: preview.brief,
    },
  };
}

function deterministicReference(brief) {
  const fixture = BASE_CATALOG.fixtures[brief.fixtureId];
  const built = buildCampaignPreview(fixture, brief.values, BASE_CATALOG);
  if (!built.ok) {
    throw new Error(
      `${brief.id}: deterministic preview failed: ${JSON.stringify(built.issues)}`,
    );
  }
  return built.preview;
}

function writeDeterministicReferences(pack, outDir) {
  for (const brief of pack.briefs) {
    const preview = deterministicReference(brief);
    writeJson(
      outDir,
      path.join("artifacts", "deterministic", `${brief.evalCaseId}.json`),
      artifactFromPreview(
        brief.evalCaseId,
        preview,
        {
          status: "fallback",
          provider: "deterministic",
          providerLabel: "Deterministic builder",
          providerMode: "none",
          harnessVersion: DESIGN_HARNESS_VERSION,
          guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
          code: "unavailable",
          message: "Deterministic reference; no provider call.",
        },
        "baseline",
        "Deterministic single-product template assembly",
      ),
    );
    writeJson(
      outDir,
      path.join("previews", "deterministic", `${brief.id}.json`),
      preview,
    );
  }
}

async function buildPreflight(options) {
  const pack = readJson(options.pack);
  if (!pack.briefs?.length) throw new Error("The brief pack is empty.");
  const model = options.model;
  const price = PRICING[model];
  if (!price) {
    throw new Error(
      `No pricing entry for model "${model}". Add it to PRICING before preflight.`,
    );
  }

  const briefs = [];
  let paidRequestCount = 0;
  let estimatedCost = 0;
  let conservativeCost = 0;
  const conditions = {};

  for (const condition of ["A", "B"]) {
    conditions[condition] = {
      label:
        condition === "A"
          ? "Full context and hard constraints; advisory rules omitted"
          : "Identical context and hard constraints; current advisory pack",
    };
  }

  for (const brief of pack.briefs) {
    const fixture = BASE_CATALOG.fixtures[brief.fixtureId];
    if (!fixture) throw new Error(`${brief.id}: unknown fixture ${brief.fixtureId}`);
    const deterministic = deterministicReference(brief);
    const captures = {};
    for (const condition of ["A", "B"]) {
      const capture = await capturedRequest(brief, condition);
      const plans = enumeratePlans(capture.request);
      const signatures = new Set(
        plans.map((plan) => {
          const assembled = assemblePlannedDraft(capture.result.preview.brief, plan);
          return JSON.stringify({
            layout: plan.layout,
            sections: plan.sections,
            headline: assembled.draft.headline,
            factIds: plan.factIds,
          });
        }),
      );
      const stats = promptStats(capture.request);
      captures[condition] = {
        request: capture.request,
        plans,
        distinctSignatures: signatures.size,
        prompt: {
          chars: stats.chars,
          utf8Bytes: stats.utf8Bytes,
          messageFramingBytes: stats.messageFramingBytes,
          estimatedTokens: stats.estimatedTokens,
          conservativeTokens: stats.conservativeTokens,
          estimatedCost: requestCost(
            stats.estimatedTokens,
            model,
            OUTPUT_TOKEN_BOUND,
          ),
          conservativeCost: requestCost(
            stats.conservativeTokens,
            model,
            OUTPUT_TOKEN_BOUND,
          ),
        },
      };
    }

    const predetermined =
      captures.B.distinctSignatures <= 1 ||
      captures.A.distinctSignatures <= 1;
    const requestsForBrief = predetermined ? 0 : REPEATS * 2;
    paidRequestCount += requestsForBrief;
    estimatedCost +=
      (captures.A.prompt.estimatedCost + captures.B.prompt.estimatedCost) *
      (predetermined ? 0 : REPEATS);
    conservativeCost +=
      (captures.A.prompt.conservativeCost + captures.B.prompt.conservativeCost) *
      (predetermined ? 0 : REPEATS);

    briefs.push({
      id: brief.id,
      evalCaseId: brief.evalCaseId,
      label: brief.label,
      fixtureId: brief.fixtureId,
      values: brief.values,
      deterministicReference: {
        revision: deterministic.revision,
        headline: deterministic.draft.headline,
        layout: deterministic.draft.layout,
        sections: deterministic.draft.sections,
        factIds: deterministic.draft.facts.map((fact) => fact.id),
      },
      validChoices: {
        angles: captures.B.request.allowed.angles,
        layouts: captures.B.request.allowed.layouts,
        sectionOrders: captures.B.request.allowed.sectionOrders,
        factIds: captures.B.request.allowed.factIds,
        layoutFactCapacity: captures.B.request.allowed.layoutFactCapacity,
        planCount: captures.B.plans.length,
        distinctRenderedSignatures: captures.B.distinctSignatures,
        predetermined,
      },
      conditions: Object.fromEntries(
        Object.entries(captures).map(([condition, item]) => [
          condition,
          {
            chars: item.prompt.chars,
            utf8Bytes: item.prompt.utf8Bytes,
            messageFramingBytes: item.prompt.messageFramingBytes,
            estimatedInputTokens: item.prompt.estimatedTokens,
            conservativeInputTokens: item.prompt.conservativeTokens,
            planCount: item.plans.length,
            distinctRenderedSignatures: item.distinctSignatures,
            request: item.request,
          },
        ]),
      ),
      paidRequests: requestsForBrief,
    });
  }

  if (paidRequestCount > MAX_PAID_REQUESTS) {
    throw new Error(
      `Preflight would require ${paidRequestCount} paid requests; the hard maximum is ${MAX_PAID_REQUESTS}.`,
    );
  }

  return {
    schemaVersion: 1,
    packId: pack.packId,
    packVersion: pack.packVersion,
    generatedAt: new Date().toISOString(),
    harnessVersion: DESIGN_HARNESS_VERSION,
    guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
    model,
    providerSettings: {
      id: "openai",
      responseFormat: "json_object",
      temperature: 0.2,
      outputTokenBound: OUTPUT_TOKEN_BOUND,
      retries: 0,
      timeoutMs: resolveGenerationTimeoutMs(process.env),
    },
    pricing: {
      inputPerMillionTokens: price.input,
      outputPerMillionTokens: price.output,
      outputTokenBound: OUTPUT_TOKEN_BOUND,
    },
    requestPlan: {
      paidRequests: paidRequestCount,
      repeats: REPEATS,
      conditions: ["A", "B"],
      maximum: MAX_PAID_REQUESTS,
      retries: 0,
    },
    cost: {
      estimated: estimatedCost,
      conservativeCeiling: conservativeCost,
      recommendedCap: Math.max(0.01, Math.ceil(conservativeCost * 100) / 100),
    },
    conditions,
    briefs,
  };
}

function preflightMarkdown(preflight) {
  const lines = [
    "# Campaign Lab guidance evaluation preflight",
    "",
    `- Harness: ${preflight.harnessVersion}`,
    `- Guidance pack: ${preflight.guidancePackVersion}`,
    `- Model: ${preflight.model}`,
    `- Input price: $${preflight.pricing.inputPerMillionTokens}/M tokens`,
    `- Output price: $${preflight.pricing.outputPerMillionTokens}/M tokens`,
    `- Output bound per request: ${preflight.pricing.outputTokenBound} tokens`,
    `- Temperature: ${preflight.providerSettings.temperature}`,
    `- Response format: ${preflight.providerSettings.responseFormat}`,
    `- Timeout: ${preflight.providerSettings.timeoutMs} ms`,
    `- Paid requests: ${preflight.requestPlan.paidRequests} (maximum ${preflight.requestPlan.maximum})`,
    `- Repeats: ${preflight.requestPlan.repeats} per condition per brief`,
    `- Retries: ${preflight.requestPlan.retries}`,
    `- Estimated cost: ${money(preflight.cost.estimated)}`,
    `- Conservative ceiling (UTF-8 bytes + message framing + output bound): ${money(preflight.cost.conservativeCeiling)}`,
    `- Recommended explicit cap: $${preflight.cost.recommendedCap.toFixed(2)}`,
    "",
    "## Conditions",
    "",
    ...Object.entries(preflight.conditions).map(
      ([key, value]) => `- **${key}:** ${value.label}`,
    ),
    "",
    "## Frozen briefs and valid choices",
    "",
    "| Brief | Angles | Layouts | Facts | Plans | Distinct rendered plans | Paid requests |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
  ];
  for (const brief of preflight.briefs) {
    lines.push(
      `| ${brief.id} | ${brief.validChoices.angles.join(", ")} | ${brief.validChoices.layouts.join(", ")} | ${brief.validChoices.factIds.join(", ")} | ${brief.validChoices.planCount} | ${brief.validChoices.distinctRenderedSignatures} | ${brief.paidRequests} |`,
    );
  }
  lines.push(
    "",
    "A brief with only one distinct rendered plan is marked predetermined and receives no paid calls.",
    "",
    "### Allowed section orders and deterministic references",
    "",
  );
  for (const brief of preflight.briefs) {
    lines.push(`#### ${brief.id}`, "");
    for (const [layout, orders] of Object.entries(
      brief.validChoices.sectionOrders,
    )) {
      lines.push(
        `- ${layout} (capacity ${brief.validChoices.layoutFactCapacity[layout]}): ${orders
          .map((order) => order.join(" → "))
          .join("; ")}`,
      );
    }
    lines.push(
      `- Deterministic reference: ${brief.deterministicReference.layout}, ${brief.deterministicReference.sections.join(" → ")}, facts ${brief.deterministicReference.factIds.join(", ") || "none"}, headline “${brief.deterministicReference.headline}”`,
      "",
    );
  }
  lines.push(
    "The opening angle is constrained by each brief’s approved profile or headline; the remaining layout, section order, and fact selection choices produce the plan counts above.",
    "",
    "## Prompt bounds",
    "",
    "| Brief | Condition | Prompt chars | UTF-8 bytes | Framing allowance | Estimated input tokens | Conservative input tokens |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const brief of preflight.briefs) {
    for (const condition of ["A", "B"]) {
      const item = brief.conditions[condition];
      lines.push(
        `| ${brief.id} | ${condition} | ${item.chars} | ${item.utf8Bytes} | ${item.messageFramingBytes} | ${item.estimatedInputTokens} | ${item.conservativeInputTokens} |`,
      );
    }
  }
  lines.push(
    "",
    "## Spending gate",
    "",
    "No paid request is made unless `run --execute --cap-usd <amount>` is supplied and the cap covers the conservative ceiling. The runner stops before a request that would exceed the cap, makes zero retries, and never reruns for a better-looking result.",
  );
  return `${lines.join("\n")}\n`;
}

function canaryCapFor(maxCostUsd) {
  return Math.max(0.01, Math.ceil(maxCostUsd * 1000) / 1000);
}

async function buildCanaryPreflight(options) {
  const pack = readJson(options.pack);
  const brief = pack.briefs?.[0];
  if (!brief) throw new Error("The brief pack is empty.");
  const model = options.model;
  const price = PRICING[model];
  if (!price) throw new Error(`No pricing entry for model "${model}".`);
  const capture = await capturedRequest(brief, "B");
  const stats = promptStats(capture.request);
  const maxCostUsd = requestCost(
    stats.conservativeTokens,
    model,
    OUTPUT_TOKEN_BOUND,
  );
  const timeoutMs = resolveGenerationTimeoutMs(process.env);
  return {
    schemaVersion: 1,
    packId: pack.packId,
    packVersion: pack.packVersion,
    briefId: brief.id,
    model,
    provider: "openai",
    transport: "openai-chat-completions",
    guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
    harnessVersion: DESIGN_HARNESS_VERSION,
    settings: {
      responseFormat: "json_object",
      temperature: 0.2,
      outputTokenBound: OUTPUT_TOKEN_BOUND,
      retries: 0,
      timeoutMs,
    },
    prompt: {
      chars: stats.chars,
      utf8Bytes: stats.utf8Bytes,
      messageFramingBytes: stats.messageFramingBytes,
      estimatedInputTokens: stats.estimatedTokens,
      conservativeInputTokens: stats.conservativeTokens,
    },
    pricing: {
      inputPerMillionTokens: price.input,
      outputPerMillionTokens: price.output,
    },
    maxCostUsd,
    recommendedCapUsd: canaryCapFor(maxCostUsd),
    requests: 1,
    command: `$env:OPENAI_ENABLED='true'; $env:CAMPAIGN_LAB_GENERATION_LIVE='true'; node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs canary --execute --cap-usd ${canaryCapFor(maxCostUsd).toFixed(3)} --env-file "${options.envFile ?? "<authorized-env-file>"}" --model ${model} --out "${path.join(options.out, "canary")}"`,
    request: capture.request,
  };
}

function canaryMarkdown(preflight) {
  return [
    "# One-request live provider canary",
    "",
    `- Brief: ${preflight.briefId}`,
    `- Shared adapter: ${preflight.transport}`,
    `- Model: ${preflight.model}`,
    `- Requests: 1`,
    `- Retries: ${preflight.settings.retries}`,
    `- Timeout: ${preflight.settings.timeoutMs} ms`,
    `- Output bound: ${preflight.settings.outputTokenBound} tokens`,
    `- Temperature: ${preflight.settings.temperature}`,
    `- Response format: ${preflight.settings.responseFormat}`,
    `- Prompt chars: ${preflight.prompt.chars}`,
    `- Prompt UTF-8 bytes: ${preflight.prompt.utf8Bytes}`,
    `- Framing allowance: ${preflight.prompt.messageFramingBytes} tokens`,
    `- Conservative input token bound: ${preflight.prompt.conservativeInputTokens}`,
    `- Maximum cost: ${money(preflight.maxCostUsd)}`,
    `- Recommended cap: ${money(preflight.recommendedCapUsd)}`,
    "",
    "## Exact authorized command",
    "",
    "```powershell",
    preflight.command,
    "```",
    "",
    "The previous 12-attempt allowance is exhausted. This canary requires fresh explicit authorization and a new spend cap; existing environment flags are not authorization.",
    "",
  ].join("\n");
}

async function executeCanary(options) {
  if (!options.execute) {
    throw new Error(
      "The canary did not execute. Fresh authorization and --execute --cap-usd are required.",
    );
  }
  if (!Number.isFinite(options.capUsd) || options.capUsd <= 0) {
    throw new Error("The canary requires an explicit positive --cap-usd.");
  }
  if (!options.envFile) {
    throw new Error("The canary requires --env-file. No request was made.");
  }
  if (existsSync(options.out) && !options.overwrite) {
    throw new Error(
      `Evidence directory already exists: ${options.out}. Use --overwrite only for an intentional canary.`,
    );
  }

  const preflight = await buildCanaryPreflight(options);
  if (options.capUsd + 1e-9 < preflight.maxCostUsd) {
    throw new Error(
      `The canary maximum cost ${money(preflight.maxCostUsd)} exceeds the cap ${money(options.capUsd)}. No request was made.`,
    );
  }
  const fileEnv = loadEnvFile(options.envFile);
  const env = mergedEnv(fileEnv);
  const resolved = resolveGenerationProvider({
    ...env,
    CAMPAIGN_LAB_GENERATION_PROVIDER: "openai",
    CAMPAIGN_LAB_GENERATION_MODEL: options.model,
  });
  if (!resolved.ok) {
    throw new Error(`${resolved.reason} No request was made.`);
  }
  const timeoutMs = resolveGenerationTimeoutMs(env);
  const model = options.model;
  const client = createOpenAIClient(env.OPENAI_API_KEY);
  const transport = new OpenAIGenerationTransport(client, model);
  const brief = readJson(options.pack).briefs[0];

  mkdirSync(options.out, { recursive: true });
  writeJson(options.out, "canary-preflight.json", preflight);
  writeFileSync(
    path.join(options.out, "canary-preflight.md"),
    canaryMarkdown(preflight),
  );

  const startedAt = Date.now();
  const requestId = randomUUID();
  let outcome = null;
  const provider = {
    id: "openai",
    label: "OpenAI",
    model,
    async generate(request, callOptions) {
      outcome = await transport.generate(request, callOptions);
      return outcome.value;
    },
  };

  const result = await runCampaignGeneration(
    {
      fixtureId: brief.fixtureId,
      values: brief.values,
      requestId,
    },
    {
      catalog: BASE_CATALOG,
      provider,
      guidanceLoader: conditionGuidance("B"),
      timeoutMs,
      env,
    },
  );
  const finishedAt = Date.now();
  const latencyMs = outcome?.latencyMs ?? finishedAt - startedAt;
  const usage = outcome?.usage ?? null;
  const diagnostics =
    result.ok && result.generation.diagnostics
      ? result.generation.diagnostics
      : null;
  const accounting = accountProviderUsage(
    usage,
    {
      inputPerMillionTokens: preflight.pricing.inputPerMillionTokens,
      outputPerMillionTokens: preflight.pricing.outputPerMillionTokens,
    },
    preflight.maxCostUsd,
  );
  const record = {
    schemaVersion: 1,
    executedAt: new Date().toISOString(),
    briefId: brief.id,
    requestId,
    model,
    provider: "openai",
    transport: outcome?.transport ?? "openai-chat-completions",
    providerRequestId:
      outcome?.providerRequestId ?? diagnostics?.providerRequestId ?? null,
    timeoutMs,
    retries: 0,
    requestCount: 1,
    latencyMs,
    usage: usage
      ? {
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
          prompt_tokens_details:
            usage.cachedPromptTokens === null
              ? null
              : { cached_tokens: usage.cachedPromptTokens },
        }
      : null,
    usageStatus: accounting.status,
    costUsd: accounting.costUsd,
    reservedCostUsd: preflight.maxCostUsd,
    unresolvedReservationUsd: accounting.reservedExposureUsd,
    finishReason: outcome?.finishReason ?? null,
    rawContent: outcome?.rawContent ?? null,
    diagnostics,
    request: preflight.request,
    result: result.ok
      ? {
          generation: result.generation,
          validatedProposal:
            result.generation.status === "generated"
              ? {
                  angle: result.generation.angle,
                  layout: result.generation.layout,
                  sections: result.generation.sections,
                  factIds: result.generation.factIds,
                  revision: result.preview.revision,
                }
              : null,
          preview: result.preview,
        }
      : result,
  };
  writeJson(options.out, "canary.json", record);
  console.log(
    JSON.stringify(
      {
        status: result.ok && result.generation.status === "generated"
          ? "passed"
          : "failed",
        model,
        transport: record.transport,
        requests: 1,
        usageStatus: record.usageStatus,
        costUsd: accounting.costUsd,
        reservedExposureUsd: record.unresolvedReservationUsd,
        latencyMs,
        diagnostics,
        validatedProposal: record.result?.validatedProposal ?? null,
        output: path.relative(root, options.out),
      },
      null,
      2,
    ),
  );
}

async function executeRun(options) {
  if (!options.execute) {
    throw new Error(
      "Paid execution requires --execute. Run preflight first and supply --cap-usd after authorization.",
    );
  }
  if (!Number.isFinite(options.capUsd) || options.capUsd <= 0) {
    throw new Error("Paid execution requires an explicit positive --cap-usd.");
  }
  if (!options.envFile) {
    throw new Error(
      "Paid execution requires --env-file so live-provider opt-ins and credentials stay external.",
    );
  }
  if (existsSync(options.out) && !options.overwrite) {
    throw new Error(
      `Evidence directory already exists: ${options.out}. Use --overwrite only for an intentional new run.`,
    );
  }

  const preflight = await buildPreflight(options);
  if (preflight.cost.conservativeCeiling > options.capUsd) {
    throw new Error(
      `The conservative ceiling ${money(preflight.cost.conservativeCeiling)} exceeds the cap ${money(options.capUsd)}. No request was made.`,
    );
  }

  const fileEnv = loadEnvFile(options.envFile);
  const env = mergedEnv(fileEnv);
  const resolved = resolveGenerationProvider({
    ...env,
    CAMPAIGN_LAB_GENERATION_PROVIDER: "openai",
    CAMPAIGN_LAB_GENERATION_MODEL: options.model,
  });
  if (!resolved.ok) {
    throw new Error(
      `${resolved.reason} No request was made.`,
    );
  }
  const timeoutMs = resolveGenerationTimeoutMs(env);

  mkdirSync(options.out, { recursive: true });
  writeJson(options.out, "preflight.json", preflight);
  writeFileSync(
    path.join(options.out, "preflight.md"),
    preflightMarkdown(preflight),
  );
  writeDeterministicReferences(readJson(options.pack), options.out);

  const model = options.model;
  const price = PRICING[model];
  if (!price) throw new Error(`No pricing entry for model "${model}".`);
  const client = createOpenAIClient(env.OPENAI_API_KEY);
  const transport = new OpenAIGenerationTransport(client, model);

  const records = [];
  let knownSpendUsd = 0;
  let unresolvedReservedUsd = 0;
  let unresolvedUsageRequests = 0;
  let requestCount = 0;
  let stoppedEarly = null;
  const order = [];
  for (const condition of ["A", "B"]) {
    for (const brief of preflight.briefs) {
      if (brief.paidRequests === 0) continue;
      for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
        order.push({ condition, briefId: brief.id, repeat });
      }
    }
  }
  const seed = sha256(`${preflight.packId}:${preflight.packVersion}`);
  order.sort((left, right) =>
    sha256(`${seed}:${left.condition}:${left.briefId}:${left.repeat}`).localeCompare(
      sha256(`${seed}:${right.condition}:${right.briefId}:${right.repeat}`),
    ),
  );
  if (order.length > MAX_PAID_REQUESTS) {
    throw new Error(`Run order has ${order.length} requests; maximum is ${MAX_PAID_REQUESTS}.`);
  }

  for (const item of order) {
    const brief = preflight.briefs.find((entry) => entry.id === item.briefId);
    const condition = preflight.conditions[item.condition];
    const requestTemplate = brief.conditions[item.condition].request;
    const stats = promptStats(requestTemplate);
    const reserved = requestCost(
      stats.conservativeTokens,
      model,
      OUTPUT_TOKEN_BOUND,
    );
    if (knownSpendUsd + unresolvedReservedUsd + reserved > options.capUsd + 1e-9) {
      throw new Error(
        `Stopped before ${brief.id}/${item.condition}/${item.repeat}: reserved ${money(reserved)} plus known/unresolved exposure would exceed cap ${money(options.capUsd)}.`,
      );
    }

    const startedAt = Date.now();
    const requestId = randomUUID();
    let outcome = null;
    let result = null;
    const provider = {
      id: "openai",
      label: "OpenAI",
      model,
      async generate(request, callOptions) {
        outcome = await transport.generate(request, callOptions);
        return outcome.value;
      },
    };

    try {
      result = await runCampaignGeneration(
        {
          fixtureId: brief.fixtureId,
          values: brief.values,
          requestId,
        },
        {
          catalog: BASE_CATALOG,
          provider,
          guidanceLoader: conditionGuidance(item.condition),
          timeoutMs,
          env,
        },
      );
    } catch (caught) {
      result = {
        ok: false,
        error: redactDiagnosticText(
          (caught instanceof Error ? caught.message : String(caught)).slice(
            0,
            500,
          ),
        ),
      };
    }
    const finishedAt = Date.now();
    const latencyMs = outcome?.latencyMs ?? finishedAt - startedAt;
    const usage = outcome?.usage ?? null;
    const accounting = accountProviderUsage(
      usage,
      {
        inputPerMillionTokens: price.input,
        outputPerMillionTokens: price.output,
      },
      reserved,
    );
    const usageKnown = accounting.status === "known";
    const actualCost = accounting.costUsd;
    if (usageKnown) {
      knownSpendUsd += actualCost;
    } else {
      unresolvedReservedUsd += accounting.reservedExposureUsd;
      unresolvedUsageRequests += 1;
    }
    requestCount += 1;
    if (knownSpendUsd > options.capUsd + 1e-9) {
      throw new Error(
        `Known spend ${money(knownSpendUsd)} exceeded cap ${money(options.capUsd)} after ${requestCount} requests. Stopping without retry.`,
      );
    }

    const diagnostics =
      result?.ok && result.generation.diagnostics
        ? result.generation.diagnostics
        : null;
    const record = {
      requestId,
      condition: item.condition,
      conditionLabel: condition.label,
      briefId: brief.id,
      evalCaseId: brief.evalCaseId,
      repeat: item.repeat,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      latencyMs,
      model,
      provider: "openai",
      transport: outcome?.transport ?? "openai-chat-completions",
      providerRequestId:
        outcome?.providerRequestId ?? diagnostics?.providerRequestId ?? null,
      diagnostics,
      harnessVersion: preflight.harnessVersion,
      guidancePackVersion: preflight.guidancePackVersion,
      requestTemplate: requestTemplate,
      promptChars: stats.chars,
      promptUtf8Bytes: stats.utf8Bytes,
      messageFramingBytes: stats.messageFramingBytes,
      estimatedInputTokens: stats.estimatedTokens,
      conservativeInputTokens: stats.conservativeTokens,
      outputTokenBound: OUTPUT_TOKEN_BOUND,
      usage:
        usageKnown
          ? {
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              total_tokens: usage.totalTokens,
              prompt_tokens_details:
                usage.cachedPromptTokens === null
                  ? null
                  : { cached_tokens: usage.cachedPromptTokens },
            }
          : null,
      usageStatus: accounting.status,
      costUsd: actualCost,
      reservedCostUsd: reserved,
      unresolvedReservationUsd: accounting.reservedExposureUsd,
      cumulativeKnownSpendUsd: knownSpendUsd,
      cumulativeUnresolvedReservedUsd: unresolvedReservedUsd,
      finishReason: outcome?.finishReason ?? null,
      rawContent: outcome?.rawContent ?? null,
      error: result?.ok ? null : result.error,
      result: result?.ok
        ? {
            ok: true,
            generation: result.generation,
            preview: result.preview,
          }
        : result,
    };
    records.push(record);
    writeJson(
      options.out,
      path.join(
        "requests",
        `${String(requestCount).padStart(2, "0")}-${item.condition}-${brief.id}-${item.repeat}.json`,
      ),
      record,
    );
    if (result?.ok) {
      writeJson(
        options.out,
        path.join(
          "artifacts",
          item.condition,
          `r${item.repeat}`,
          `${brief.evalCaseId}.json`,
        ),
        artifactFromPreview(
          brief.evalCaseId,
          result.preview,
          result.generation,
          result.generation.status === "generated" ? "generated" : "baseline",
          `OpenAI ${model} · condition ${item.condition} · repeat ${item.repeat} · ${result.generation.status}`,
        ),
      );
      writeJson(
        options.out,
        path.join(
          "previews",
          item.condition,
          `${brief.id}-${item.repeat}.json`,
        ),
        result.preview,
      );
    }
    if (shouldStopAfterFailure(diagnostics)) {
      stoppedEarly = {
        reason: `Stopped after ${brief.id}/${item.condition}/${item.repeat} because the provider failure category was ${diagnostics.category}.`,
        category: diagnostics.category,
        diagnostics,
      };
      break;
    }
  }

  const knownUsageRecords = records.filter(
    (record) => record.usageStatus === "known",
  );
  const usageTotals = knownUsageRecords.reduce(
    (totals, record) => ({
      promptTokens: totals.promptTokens + (record.usage?.prompt_tokens ?? 0),
      completionTokens:
        totals.completionTokens + (record.usage?.completion_tokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0 },
  );
  const summary = {
    schemaVersion: 1,
    packId: preflight.packId,
    packVersion: preflight.packVersion,
    executedAt: new Date().toISOString(),
    model,
    capUsd: options.capUsd,
    requestCount,
    knownUsageRequests: knownUsageRecords.length,
    unresolvedUsageRequests,
    knownSpendUsd,
    unresolvedReservedUsd,
    conservativeExposureUsd: knownSpendUsd + unresolvedReservedUsd,
    stoppedEarly,
    usageTotals,
    statusCounts: {
      generated: records.filter(
        (record) => record.result?.generation?.status === "generated",
      ).length,
      fallback: records.filter(
        (record) => record.result?.generation?.status === "fallback",
      ).length,
      invalid: records.filter(
        (record) => record.result?.generation?.code === "invalid",
      ).length,
      timeout: records.filter(
        (record) => record.result?.generation?.code === "timeout",
      ).length,
    },
    preflight,
    records,
  };
  writeJson(options.out, "run.json", summary);
  writeFileSync(
    path.join(options.out, "run.md"),
    `# Guidance evaluation run\n\n- Model: ${model}\n- Requests: ${requestCount}\n- Known usage requests: ${knownUsageRecords.length}\n- Unresolved usage requests: ${unresolvedUsageRequests}\n- Known spend: ${money(knownSpendUsd)}\n- Unresolved reserved exposure: ${money(unresolvedReservedUsd)}\n- Conservative exposure: ${money(knownSpendUsd + unresolvedReservedUsd)}\n- Cap: ${money(options.capUsd)}\n${stoppedEarly ? `- Stopped early: ${stoppedEarly.reason}\n` : ""}`,
  );
  console.log(
    JSON.stringify(
      {
        status: stoppedEarly ? "stopped-early" : "completed",
        model,
        requests: requestCount,
        knownUsageRequests: knownUsageRecords.length,
        unresolvedUsageRequests,
        knownSpendUsd: Number(knownSpendUsd.toFixed(6)),
        unresolvedReservedUsd: Number(unresolvedReservedUsd.toFixed(6)),
        conservativeExposureUsd: Number(
          (knownSpendUsd + unresolvedReservedUsd).toFixed(6),
        ),
        capUsd: options.capUsd,
        stoppedEarly: stoppedEarly?.reason ?? null,
        output: path.relative(root, options.out),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const options = parseCli();
  if (options.command === "preflight") {
    const preflight = await buildPreflight(options);
    mkdirSync(options.out, { recursive: true });
    writeJson(options.out, "preflight.json", preflight);
    writeFileSync(
      path.join(options.out, "preflight.md"),
      preflightMarkdown(preflight),
    );
    writeDeterministicReferences(readJson(options.pack), options.out);
    console.log(preflightMarkdown(preflight));
    console.log(`Evidence directory: ${path.relative(root, options.out)}`);
    return;
  }
  if (options.command === "canary") {
    if (options.execute) {
      await executeCanary(options);
      return;
    }
    const preflight = await buildCanaryPreflight(options);
    mkdirSync(options.out, { recursive: true });
    writeJson(options.out, "canary-preflight.json", preflight);
    writeFileSync(
      path.join(options.out, "canary-preflight.md"),
      canaryMarkdown(preflight),
    );
    console.log(canaryMarkdown(preflight));
    console.log(`Evidence directory: ${path.relative(root, options.out)}`);
    return;
  }
  await executeRun(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
