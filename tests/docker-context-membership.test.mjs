import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const minimatch = require("minimatch");
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dockerfile = readFileSync(path.join(repositoryRoot, "Dockerfile"), "utf8");
const dockerignore = readFileSync(path.join(repositoryRoot, ".dockerignore"), "utf8");

function parseDockerIgnore(source) {
  return source.split(/\r?\n/).flatMap((line) => {
    if (line.startsWith("#")) return [];
    const cleaned = line.trim().replace(/^\/+|\/+$/g, "");
    if (!cleaned || cleaned === ".") return [];

    const negated = cleaned.startsWith("!");
    const pattern = negated ? cleaned.slice(1) : cleaned;
    assert.match(pattern, /^[A-Za-z0-9_.*?/-]+$/, `unsupported .dockerignore pattern: ${line}`);
    return [{ negated, pattern }];
  });
}

// This models ordered exclusion/exception and file-or-parent matching for the
// repository's narrow .dockerignore syntax. minimatch's dot:true option is
// required because Docker wildcards include dot-prefixed path segments.
function dockerPatternMatches(candidate, pattern) {
  return minimatch(candidate, pattern, { dot: true, matchBase: false, nonegate: true });
}

function dockerContextIncludes(candidate, rules = parseDockerIgnore(dockerignore), matchesPattern = dockerPatternMatches) {
  const normalized = candidate.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  assert.ok(normalized && !normalized.split("/").includes(".."), `invalid context path: ${candidate}`);
  const segments = normalized.split("/");

  let excluded = false;
  for (const { negated, pattern } of rules) {
    if (negated !== excluded) continue;

    let matches = matchesPattern(normalized, pattern);
    for (let depth = 1; !matches && depth < segments.length; depth += 1) {
      matches = matchesPattern(segments.slice(0, depth).join("/"), pattern);
    }
    if (matches) excluded = !negated;
  }
  return !excluded;
}

function instructionTokens(line) {
  assert.doesNotMatch(line, /["']/u, `quoted COPY syntax needs explicit parsing: ${line}`);
  return line.trim().split(/\s+/u);
}

function dockerCopyInstructions() {
  return dockerfile
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^(?:COPY|ADD)\s/u.test(line));
}

function operands(tokens) {
  return tokens.slice(1).filter((token) => !token.startsWith("--"));
}

function localModuleImports(repositoryPath) {
  const source = readFileSync(path.join(repositoryRoot, repositoryPath), "utf8");
  const imports = [];
  const pattern = /\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

function resolveLocalModule(importer, specifier) {
  const base = path.resolve(repositoryRoot, path.dirname(importer), specifier);
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
  const indexFiles = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"];
  const candidates = [
    ...extensions.map((extension) => `${base}${extension}`),
    ...indexFiles.map((file) => path.join(base, file)),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  assert.ok(resolved, `cannot resolve local import ${specifier} from ${importer}`);
  const repositoryPath = path.relative(repositoryRoot, resolved).split(path.sep).join("/");
  assert.ok(!repositoryPath.startsWith("../"), `local import escapes repository: ${specifier}`);
  return repositoryPath;
}

function runtimeConfigImportClosure(entry = "next.config.ts") {
  const pending = [entry];
  const closure = new Set();
  while (pending.length > 0) {
    const repositoryPath = pending.pop();
    if (closure.has(repositoryPath)) continue;
    assert.ok(existsSync(path.join(repositoryRoot, repositoryPath)), `runtime config source is missing: ${repositoryPath}`);
    closure.add(repositoryPath);
    for (const specifier of localModuleImports(repositoryPath)) {
      pending.push(resolveLocalModule(repositoryPath, specifier));
    }
  }
  return closure;
}

function runnerCopies(repositoryPath) {
  return dockerCopyInstructions().some((instruction) => {
    const tokens = instructionTokens(instruction);
    if (!tokens.includes("--from=builder")) return false;
    const copyOperands = operands(tokens);
    return copyOperands.length === 2
      && copyOperands[0] === `/app/${repositoryPath}`
      && copyOperands[1] === `./${repositoryPath}`;
  });
}

test("Docker context includes every source-copy input while excluding private state and evidence", () => {
  const instructions = dockerCopyInstructions();
  assert.ok(instructions.length > 0, "Dockerfile must retain source-copy instructions");

  const explicitContextSources = [];
  const builderStageSources = [];
  for (const instruction of instructions) {
    const tokens = instructionTokens(instruction);
    const from = tokens.find((token) => token.startsWith("--from="))?.slice("--from=".length);
    const copySources = operands(tokens).slice(0, -1);
    if (from === undefined) explicitContextSources.push(...copySources.filter((source) => source !== "."));

    if (from === "builder") {
      for (const source of copySources) {
        if (!source.startsWith("/app/")) continue;
        const repositoryPath = source.slice("/app/".length);
        if (repositoryPath === ".next" || !existsSync(path.join(repositoryRoot, repositoryPath))) continue;
        builderStageSources.push(repositoryPath);
      }
    }
  }

  for (const source of explicitContextSources) {
    assert.ok(existsSync(path.join(repositoryRoot, source)), `Dockerfile source does not exist: ${source}`);
    assert.ok(dockerContextIncludes(source), `Dockerfile context source is ignored: ${source}`);
  }

  const runtimeHelpers = [
    "deploy/coolify/runtime-probes.mjs",
    "deploy/coolify/verify-runtime-config.mjs",
  ];
  for (const helper of runtimeHelpers) {
    assert.ok(
      instructions.some((instruction) => {
        const tokens = instructionTokens(instruction);
        return tokens.includes("--from=builder")
          && operands(tokens)[0] === `/app/${helper}`
          && operands(tokens).at(-1) === `./${helper}`;
      }),
      `runner must copy ${helper} from the builder stage`,
    );
    assert.ok(existsSync(path.join(repositoryRoot, helper)), `runtime helper is missing: ${helper}`);
    assert.ok(dockerContextIncludes(helper), `runtime helper is ignored by Docker context: ${helper}`);
  }
  const verifierException = "deploy/coolify/verify-runtime-config.mjs";
  assert.equal(
    dockerContextIncludes(verifierException, parseDockerIgnore(dockerignore).filter(({ pattern, negated }) => !(negated && pattern === verifierException))),
    false,
    "the helper remains excluded unless the ordered exact exception is present",
  );

  for (const source of new Set(builderStageSources)) {
    assert.ok(dockerContextIncludes(source), `builder-to-runner source is ignored by Docker context: ${source}`);
  }

  for (const excluded of [
    ".env.local",
    "operator-key.pem",
    ".operator-key.pem",
    ".local/session-state.json",
    ".codex/auth-cache.json",
    "deploy/coolify/runtime.env",
    "deploy/coolify/compose.private-staging.proposed.json",
    "deploy/coolify/.private.json",
    "deploy/coolify/.hidden/.nested/private.json",
    ".private/notes.md",
    ".private/.nested/notes.md",
    "artifacts/diagnostics/failure.json",
    "docs/handoffs/review-evidence.md",
    "tests/sri-build-finalizer.test.mjs",
  ]) {
    assert.equal(dockerContextIncludes(excluded), false, `private/local/evidence path entered context: ${excluded}`);
  }

  assert.equal(dockerContextIncludes("src/lib/env.ts"), true, "application source must remain in context");
  assert.equal(dockerContextIncludes("public/robots.txt"), true, "public app assets must remain in context");
});

test("runner packages the complete transitive local import closure of next.config.ts", () => {
  const closure = runtimeConfigImportClosure();
  assert.deepEqual(
    [...closure].sort(),
    [
      "next.config.ts",
      "src/lib/private-preview.ts",
      "src/lib/security-headers.ts",
    ].sort(),
    "review the runtime config's complete local import closure",
  );
  for (const repositoryPath of closure) {
    assert.ok(
      runnerCopies(repositoryPath),
      `runner image does not copy the next.config.ts import closure member ${repositoryPath}`,
    );
  }
});

test("hidden-path counterexamples fail under the former glob model and pass with Docker dot matching", () => {
  const formerMatcher = (candidate, pattern) => path.matchesGlob(candidate, pattern);
  const counterexamples = [
    ".operator-key.pem",
    "deploy/coolify/.private.json",
    ".private/notes.md",
    ".private/.nested/notes.md",
  ];

  for (const candidate of counterexamples) {
    assert.equal(
      dockerContextIncludes(candidate, parseDockerIgnore(dockerignore), formerMatcher),
      true,
      `the former path.matchesGlob model incorrectly included ${candidate}`,
    );
    assert.equal(dockerContextIncludes(candidate), false, `Docker dot matching excludes ${candidate}`);
  }

  const orderedRules = parseDockerIgnore(".private\n!.private/\n.private/**\n!.private/keep.md");
  assert.equal(dockerContextIncludes(".private/keep.md", orderedRules), true, "later exception includes an exact child");
  assert.equal(dockerContextIncludes(".private/.nested/notes.md", orderedRules), false, "parent match keeps nested hidden evidence excluded");
});
