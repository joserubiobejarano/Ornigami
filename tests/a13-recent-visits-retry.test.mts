import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });

function findNode(tree: unknown, predicate: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!tree || typeof tree !== "object") return undefined;
  const element = tree as Element;
  if ("type" in element && "props" in element && predicate(element)) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function tableHarness(fetcher: typeof fetch) {
  let cursor = 0;
  const state: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const React = {
    useState<T>(initial: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [state[index] as T, (next) => {
        state[index] = typeof next === "function" ? (next as (current: T) => T)(state[index] as T) : next;
      }];
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index] as { current: T };
    },
    useSyncExternalStore(_subscribe: unknown, _getSnapshot: unknown, getServerSnapshot: () => unknown) {
      cursor++;
      return getServerSnapshot();
    },
  };
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": "a",
    "@/components/ui/button": { Button: "button" },
    "@/lib/format-date": { formatProductDate: () => "visit date" },
    "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
    "@/modules/review-booster/components/status-badge": { StatusBadge: "span" },
    "@/lib/clock-store": { createClockStore: ({ serverSnapshot }: { serverSnapshot: number | null }) => ({
      subscribe: () => () => undefined,
      getSnapshot: () => serverSnapshot,
      getServerSnapshot: () => serverSnapshot,
    }) },
  };
  const source = readFileSync(resolve("src/modules/review-booster/components/recent-visits-table.tsx"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const localRequire = (id: string) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    throw new Error(`Unexpected module ${id}`);
  };
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${compiled}\n})`, {
    fetch: fetcher, URLSearchParams, Intl, Date, console,
  }) as (exports: object, require: typeof localRequire, moduleValue: typeof mod) => void;
  execute(mod.exports, localRequire, mod);
  const RecentVisitsTable = mod.exports.RecentVisitsTable as (props: Record<string, unknown>) => unknown;
  return {
    render() {
      cursor = 0;
      return RecentVisitsTable({
        businessId: "business-1",
        initialVisits: [{ id: "visit-1", business_id: "business-1", visited_at: "2026-10-20T12:00:00Z", followup_status: "failed", delivery_status: "failed" }],
        initialPage: { nextCursor: "next-cursor", hasMore: true },
      });
    },
  };
}

test("a failed visit-page move retries the same direction and opaque cursor", async () => {
  const urls: string[] = [];
  let attempt = 0;
  const harness = tableHarness(async (input) => {
    urls.push(String(input));
    attempt += 1;
    if (attempt === 1) return Response.json({ error: "Temporary page failure." }, { status: 503 });
    return Response.json({ items: [], page: { nextCursor: null, hasMore: false } });
  });

  const next = findNode(harness.render(), (node) => node.type === "button" && node.props.children === "Next");
  assert.ok(next);
  (next.props.onClick as () => void)();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));

  const retry = findNode(harness.render(), (node) => node.type === "button" && node.props.children === "Retry page change");
  assert.ok(retry);
  (retry.props.onClick as () => void)();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  assert.deepEqual(urls, [
    "/api/review-booster/visits?businessId=business-1&limit=50&cursor=next-cursor",
    "/api/review-booster/visits?businessId=business-1&limit=50&cursor=next-cursor",
  ]);
  assert.equal(findNode(harness.render(), (node) => node.props.role === "alert"), undefined);
});
