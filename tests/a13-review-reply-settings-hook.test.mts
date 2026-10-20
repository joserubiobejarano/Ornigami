import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function settingsHookHarness(cookie: string) {
  let cursor = 0;
  const state: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  let settingsReads = 0;
  const React = {
    useState<T>(initial: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [state[index] as T, (next) => {
        state[index] = typeof next === "function" ? (next as (current: T) => T)(state[index] as T) : next;
      }];
    },
    useEffect(effect: () => void | (() => void)) { effects.push(effect); },
  };
  const modules = {
    react: React,
    sonner: { toast: { success() {}, error() {} } },
    "@/modules/review-replies/services/review-replies-api.service": {
      fetchReplySettings: async () => { settingsReads += 1; return null; },
      updateReplySettings: async () => undefined,
    },
  };
  const source = readFileSync(resolve("src/modules/review-replies/hooks/use-review-reply-settings.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const localRequire = (id: string) => {
    if (Object.hasOwn(modules, id)) return modules[id as keyof typeof modules];
    throw new Error(`Unexpected module ${id}`);
  };
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${compiled}\n})`, {
    document: { cookie }, window: { setTimeout },
  }) as (exports: object, require: typeof localRequire, moduleValue: typeof mod) => void;
  execute(mod.exports, localRequire, mod);
  const invokeSettingsHook = mod.exports.useReviewReplySettings as () => { isDemo: boolean; settingsLoading: boolean; settingsLoaded: boolean };
  return {
    render() { cursor = 0; return invokeSettingsHook(); },
    runEffects() { for (const effect of effects) effect?.(); },
    settingsReads: () => settingsReads,
  };
}

test("demo cookie leaves settings non-loading and never reads provider settings", async () => {
  const harness = settingsHookHarness("ll_demo=true");
  const result = harness.render();
  assert.equal(result.isDemo, true);
  assert.equal(result.settingsLoading, false);
  assert.equal(result.settingsLoaded, false);
  harness.runEffects();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  assert.equal(harness.settingsReads(), 0);
});
