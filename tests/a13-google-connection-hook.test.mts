import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  createConnectionRequestGuard,
  createGoogleConnectionRequest,
} from "../src/modules/review-replies/services/google-connection-request.ts";

type HookResult = {
  connectionData: { connected: boolean } | null;
  connLoading: boolean;
  error: string | null;
  reload(options?: { force?: boolean }): Promise<void>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function hookHarness(fetcher: (url: string) => Promise<Response>) {
  let cursor = 0;
  const state: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{ deps: unknown[]; value: unknown }> = [];
  const effects: Array<{ deps: unknown[]; run: () => void | (() => void); cleanup?: () => void }> = [];
  const pendingEffects = new Set<number>();
  const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const React = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [state[index] as T, (value) => {
        state[index] = typeof value === "function" ? (value as (current: T) => T)(state[index] as T) : value;
      }];
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: unknown[]) {
      const index = cursor++;
      if (!callbacks[index] || !sameDeps(callbacks[index].deps, deps)) callbacks[index] = { deps, value: callback };
      return callbacks[index].value as T;
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!effects[index] || !sameDeps(effects[index].deps, deps)) {
        effects[index] = { deps, run: effect, cleanup: effects[index]?.cleanup };
        pendingEffects.add(index);
      }
    },
  };
  const modules = {
    react: React,
    "@/modules/review-replies/services/google-connection-request": {
      createGoogleConnectionRequest,
      createConnectionRequestGuard,
    },
  };
  const source = readFileSync(resolve("src/modules/review-replies/hooks/use-google-connection.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const localRequire = (id: string) => {
    if (Object.hasOwn(modules, id)) return modules[id as keyof typeof modules];
    throw new Error(`Unexpected module ${id}`);
  };
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${compiled}\n})`, {
    fetch: fetcher,
  }) as (exports: object, require: typeof localRequire, module: typeof mod) => void;
  execute(mod.exports, localRequire, mod);
  const invokeConnectionHook = mod.exports.useGoogleConnection as (input: { businessId?: string; enabled: boolean; isDemo?: boolean }) => HookResult;
  let input: { businessId?: string; enabled: boolean; isDemo?: boolean } = { enabled: false };
  return {
    setInput(next: typeof input) { input = next; },
    render() { cursor = 0; return invokeConnectionHook(input); },
    runEffects() {
      for (const index of [...pendingEffects]) {
        pendingEffects.delete(index);
        const effect = effects[index];
        if (!effect) continue;
        effect.cleanup?.();
        effect.cleanup = effect.run() || undefined;
      }
    },
  };
}

const ok = (connected: boolean) => Response.json({ connected });
const tick = () => new Promise((resolveTick) => setTimeout(resolveTick, 0));

test("connection hook waits for readiness and never issues an unscoped read", async () => {
  const urls: string[] = [];
  const harness = hookHarness(async (url) => { urls.push(url); return ok(true); });
  harness.render().reload();
  harness.runEffects();
  await tick();
  assert.deepEqual(urls, []);

  harness.setInput({ enabled: true });
  harness.render().reload();
  harness.runEffects();
  await tick();
  assert.deepEqual(urls, []);

  harness.setInput({ enabled: true, businessId: "resolved-business" });
  harness.render();
  harness.runEffects();
  await tick();
  assert.deepEqual(urls, ["/api/google/connection?businessId=resolved-business"]);
});

test("hook deduplicates overlapping reloads for its active business", async () => {
  const response = deferred<Response>();
  const urls: string[] = [];
  const harness = hookHarness(async (url) => { urls.push(url); return response.promise; });
  harness.setInput({ enabled: true, businessId: "business" });
  harness.render();
  harness.runEffects();
  const overlappingReload = harness.render().reload();
  assert.deepEqual(urls, ["/api/google/connection?businessId=business"]);
  response.resolve(ok(true));
  await overlappingReload;
  await tick();
  assert.equal(harness.render().connectionData?.connected, true);
});

test("forced refresh preserves current data while loading", async () => {
  const responses = [deferred<Response>(), deferred<Response>()];
  let index = 0;
  const harness = hookHarness(async () => responses[index++].promise);
  harness.setInput({ enabled: true, businessId: "business" });
  harness.render();
  harness.runEffects();
  responses[0].resolve(ok(true));
  await tick();
  assert.equal(harness.render().connectionData?.connected, true);

  const refresh = harness.render().reload({ force: true });
  const refreshing = harness.render();
  assert.equal(refreshing.connectionData?.connected, true);
  assert.equal(refreshing.connLoading, false);
  responses[1].resolve(ok(false));
  await refresh;
  assert.equal(harness.render().connectionData?.connected, false);
});

test("scope changes hide old data immediately and discard stale responses", async () => {
  const responses = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
  let index = 0;
  const harness = hookHarness(async () => responses[index++].promise);
  harness.setInput({ enabled: true, businessId: "old" });
  harness.render();
  harness.runEffects();
  responses[0].resolve(ok(true));
  await tick();
  assert.equal(harness.render().connectionData?.connected, true);

  const staleReload = harness.render().reload({ force: true });
  harness.setInput({ enabled: true, businessId: "new" });
  const switched = harness.render();
  assert.equal(switched.connectionData, null);
  harness.runEffects();
  responses[1].resolve(ok(true));
  responses[2].resolve(ok(false));
  await staleReload;
  await tick();
  assert.equal(harness.render().connectionData?.connected, false);
});

test("failed connection reads clear loading and can be retried", async () => {
  let attempt = 0;
  const harness = hookHarness(async () => {
    attempt += 1;
    if (attempt === 1) return new Response("{}", { status: 503 });
    return ok(true);
  });
  harness.setInput({ enabled: true, businessId: "business" });
  harness.render();
  harness.runEffects();
  await tick();
  assert.equal(harness.render().connLoading, false);
  assert.match(harness.render().error ?? "", /couldn't load/i);

  await harness.render().reload({ force: true });
  assert.equal(attempt, 2);
  assert.equal(harness.render().connectionData?.connected, true);
  assert.equal(harness.render().error, null);
});
