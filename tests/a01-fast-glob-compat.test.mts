import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const nextRequire = createRequire(path.join(projectRoot, "node_modules/@next/eslint-plugin-next/dist/utils/get-root-dirs.js"));
const estreeRequire = createRequire(path.join(projectRoot, "node_modules/@typescript-eslint/typescript-estree/dist/parseSettings/resolveProjectList.js"));
const nextGlob = nextRequire("fast-glob");
const estreeGlob = estreeRequire("fast-glob");

function createFixture() {
  const fixtureParent = path.join(projectRoot, "build/a01-advisory-validation");
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(path.join(fixtureParent, "glob-"));
  for (const directory of [
    "src/app",
    "src/pages",
    "src/components",
    "apps/web/src/app",
    "apps/web/src/pages",
    "packages/first",
    "packages/second",
    "node_modules/direct-dep",
    "nested/node_modules/transitive-dep",
  ]) mkdirSync(path.join(root, directory), { recursive: true });
  for (const file of [
    "packages/first/tsconfig.json",
    "packages/second/tsconfig.json",
    "node_modules/direct-dep/tsconfig.json",
    "nested/node_modules/transitive-dep/tsconfig.json",
    "nested/ignored.json",
    "apps/web/src/pages/about.js",
  ]) writeFileSync(path.join(root, file), "{}\n");
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test("both locked consumers resolve the explicit local adapter API", () => {
  assert.equal(nextGlob, estreeGlob);
  assert.deepEqual(Object.keys(nextGlob).sort(), ["globSync", "sync"]);
});

test("locked consumers use only the adapter methods and options covered here", () => {
  const nextSource = readFileSync(nextRequire.resolve("./get-root-dirs.js"), "utf8");
  const estreeSource = readFileSync(estreeRequire.resolve("./resolveProjectList.js"), "utf8");
  assert.deepEqual([...nextSource.matchAll(/\b_fastglob\.(\w+)/g)].map((match) => match[1]), ["globSync"]);
  assert.match(nextSource, /globSync\)\(rootDir\.replace\([\s\S]*?onlyDirectories:\s*true/);
  assert.deepEqual([...estreeSource.matchAll(/\bfast_glob_1\.(\w+)/g)].map((match) => match[1]), ["sync"]);
  assert.match(estreeSource, /sync\)\(pattern,\s*\{\s*cwd:\s*options\.tsconfigRootDir,\s*ignore:\s*projectFolderIgnoreList/);
});

test("Next root directory glob preserves absolute paths and directory formatting", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const pattern = path.join(fixture.root, "src", "*").replace(/\\/g, "/");
  assert.deepEqual(nextGlob.globSync(pattern, { onlyDirectories: true }).sort(), [
    path.join(fixture.root, "src/app"),
    path.join(fixture.root, "src/components"),
    path.join(fixture.root, "src/pages"),
  ].map((value) => value.replace(/\\/g, "/")).sort());
});

test("Next root directory glob supports the configured brace-root form", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const pattern = path.join(fixture.root, "src", "{app,pages}").replace(/\\/g, "/");
  assert.deepEqual(nextGlob.globSync(pattern, { onlyDirectories: true }).sort(), [
    path.join(fixture.root, "src/app"),
    path.join(fixture.root, "src/pages"),
  ].map((value) => value.replace(/\\/g, "/")).sort());
});

test("Next relative globs retain relative paths, literal directories, and empty matches", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  assert.deepEqual(nextGlob.globSync("src/*", { cwd: fixture.root, onlyDirectories: true }).sort(), [
    "src/app",
    "src/components",
    "src/pages",
  ]);
  assert.deepEqual(nextGlob.globSync("src", { cwd: fixture.root, onlyDirectories: true }), ["src"]);
  assert.deepEqual(nextGlob.globSync("missing*", { cwd: fixture.root, onlyDirectories: true }), []);
});

test("Next no-html-link-for-pages uses adapter-discovered roots and preserves rule behavior", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { Linter } = nextRequire("eslint");
  const { default: noHtmlLinkForPages } = nextRequire("../rules/no-html-link-for-pages");
  const linter = new Linter();
  const rootPattern = path.join(fixture.root, "apps", "*").replace(/\\/g, "/");
  const messages = linter.verify(
    'export default function Page() { return <><a href="/about">About</a><Link href="/about">About</Link></>; }',
    {
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      files: ["**/*.jsx"],
      plugins: { "@next/next": { rules: { "no-html-link-for-pages": noHtmlLinkForPages } } },
      rules: { "@next/next/no-html-link-for-pages": "error" },
      settings: { next: { rootDir: rootPattern } },
    },
    { filename: path.join(fixture.root, "apps/web/src/app/page.jsx") },
  );
  assert.equal(messages.length, 1);
  assert.ok(messages[0].message.includes("Use `<Link />` from `next/link` instead"));
});

test("TypeScript project discovery excludes nested node_modules", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { clearGlobResolutionCache, resolveProjectList } = estreeRequire("./resolveProjectList");
  clearGlobResolutionCache();
  const result = resolveProjectList({
    project: ["packages/*/tsconfig.json", "**/tsconfig.json"],
    tsconfigRootDir: fixture.root,
    singleRun: true,
  });
  assert.deepEqual([...result.values()], [
    path.resolve(fixture.root, "packages/first/tsconfig.json"),
    path.resolve(fixture.root, "packages/second/tsconfig.json"),
  ]);
  clearGlobResolutionCache();
});

test("positive fast-glob ignore patterns exclude matching project files", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const found = estreeGlob.sync("packages/*/tsconfig.json", {
    cwd: fixture.root,
    ignore: ["packages/second/**"],
  });
  assert.deepEqual(found.sort(), ["packages/first/tsconfig.json"]);
});

test("TypeScript project discovery keeps configured pattern order and canonical de-duplication", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { clearGlobResolutionCache, resolveProjectList } = estreeRequire("./resolveProjectList");
  clearGlobResolutionCache();
  const result = resolveProjectList({
    project: ["packages/second/tsconfig.json", "packages/*/tsconfig.json"],
    tsconfigRootDir: fixture.root,
    singleRun: true,
  });
  assert.deepEqual([...result.values()], [
    path.resolve(fixture.root, "packages/second/tsconfig.json"),
    path.resolve(fixture.root, "packages/first/tsconfig.json"),
  ]);
  clearGlobResolutionCache();
});

test("TypeScript-ESTree's negated exclusion syntax remains an exclusion", (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const nestedPattern = "**/tsconfig.json";
  const found = estreeGlob.sync(nestedPattern, {
    cwd: fixture.root,
    ignore: ["!**/node_modules/**"],
  });
  assert.deepEqual(found.sort(), ["packages/first/tsconfig.json", "packages/second/tsconfig.json"]);
});

test("unknown fast-glob options and malformed ignore lists fail instead of being dropped", () => {
  assert.throws(() => nextGlob.sync("src/*", { followSymbolicLinks: false }), /Unsupported fast-glob option/);
  assert.throws(() => estreeGlob.sync("**/*.json", { ignore: "**/node_modules/**" }), /ignore to be a string array/);
});
