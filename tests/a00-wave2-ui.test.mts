import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { isPlanId } from "../src/lib/billing/plans.ts";

type Element = { type: unknown; props: Record<string, unknown> };
function jsx(type: unknown, props: Record<string, unknown>) { return { type, props }; }

function componentHarness(relativePath: string, overrides: Record<string, unknown>) {
  const nativeRequire = createRequire(import.meta.url);
  let cursor = 0;
  const state: unknown[] = [];
  const effects: Array<() => void> = [];
  const React = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [state[index] as T, (value) => { state[index] = typeof value === "function" ? (value as (current: T) => T)(state[index] as T) : value; }];
    },
    useEffect(effect: () => void | (() => void)) {
      const index = cursor++;
      if (!effects[index]) effects[index] = effect;
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T) { cursor++; return callback; },
    Suspense: "suspense",
  };
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    ...overrides,
  };
  const sourcePath = resolve(process.cwd(), relativePath);
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const localRequire = (id: string) => Object.hasOwn(modules, id) ? modules[id] : nativeRequire(id);
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${compiled}\n})`, {
    URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, Buffer, AbortSignal,
    ReadableStream, WritableStream, Blob, process, fetch: overrides.__fetch ?? fetch,
    window: overrides.__window, console, setTimeout, clearTimeout, setInterval, clearInterval,
  }) as (exports: object, require: typeof localRequire, module: typeof mod) => void;
  execute(mod.exports, localRequire, mod);
  return {
    exports: mod.exports,
    render(component: () => unknown) { cursor = 0; return component(); },
    runEffects() { for (const effect of effects) effect?.(); },
  };
}

function findNode(tree: unknown, predicate: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = findNode(child, predicate); if (found) return found; }
    return undefined;
  }
  if (!tree || typeof tree !== "object") return undefined;
  const node = tree as Element;
  if ("type" in node && "props" in node && predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function textContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "props" in value) return textContent((value as Element).props.children);
  return "";
}

test("billing plan CTA reflects durable trial eligibility", () => {
  const modules = {
    "@/components/billing/billing-period-toggle": { BillingPeriodToggle: "div" },
    "@/components/dashboard/change-plan-button": { ChangePlanButton: "button" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardDescription: "p", CardHeader: "header", CardTitle: "h2" },
    "@/lib/billing/plans": {
      PLANS: {
        replies: { name: "Replies", tagline: "Replies", recommended: false, features: [] },
        booster: { name: "Booster", tagline: "Booster", recommended: false, features: [] },
        complete: { name: "Complete", tagline: "Complete", recommended: true, features: [] },
      },
      PLAN_ORDER: ["replies", "booster", "complete"],
      effectiveMonthlyFromAnnual: () => "EUR 1/month",
      formatAnnualSavings: () => "Save EUR 1/year",
      formatPrice: () => "EUR 1",
    },
  };
  const loaded = componentHarness("src/components/billing/billing-plan-options.tsx", modules);
  const Component = loaded.exports.BillingPlanOptions as (props: { currentPlan: null; currentPeriod: "monthly"; trialEligible: boolean }) => unknown;
  for (const [trialEligible, expected] of [[true, "Start free trial"], [false, "Continue to checkout"]] as const) {
    const tree = loaded.render(() => Component({ currentPlan: null, currentPeriod: "monthly", trialEligible }));
    const button = findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === expected);
    assert.ok(button, `expected checkout label: ${expected}`);
    assert.equal(findNode(tree, (node) => node.type === "form" && node.props.action === "/api/stripe/checkout")?.props.method, "post");
  }
});

test("plan validation rejects inherited object keys", () => {
  assert.equal(isPlanId("complete"), true);
  for (const value of ["constructor", "toString", "__proto__"]) assert.equal(isPlanId(value), false);
});

function settingsHarness(connection: { connected: boolean; canManage: boolean; selectionLocked?: boolean; locations: Array<Record<string, unknown>> }, onSelect: (body: unknown) => void) {
  let connectionFetches = 0;
  const dashboard = Object.fromEntries(["DashboardCallout", "DashboardPage", "DashboardPageHeader", "FormField", "StatusBadge"].map((key) => [key, key]));
  const loaded = componentHarness("src/modules/review-replies/pages/settings-page.tsx", {
    "next/link": "a",
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "next-auth/react": { useSession: () => ({ data: { user: { email: "owner@example.com" } } }) },
    "@/components/dashboard": dashboard,
    "@/components/SignOutButton": { default: "SignOutButton" },
    "@/components/dashboard/team-members-card": { TeamMembersCard: "TeamMembersCard" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardDescription: "p", CardHeader: "header", CardTitle: "h2" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/switch": { Switch: "switch" },
    "@/components/ui/skeleton": { Skeleton: "div" },
    "@/lib/form-controls": { nativeSelectClassName: "select" },
    "@/modules/review-replies/hooks/use-review-reply-settings": {
      TONE_OPTIONS: [],
      useReviewReplySettings: () => ({ isDemo: false, businessName: "Workspace", setBusinessName() {}, tone: "warm", setTone() {}, ownerName: "Owner", setOwnerName() {}, contactPreference: "email", setContactPreference() {}, settingsLoading: false, settingsError: null, saveState: "idle", autoReplyAllReviews: false, autoReplySaving: false, saveReplySettings: async () => {}, persistAutoReply: async () => {} }),
    },
    __fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/google/connection") {
        connectionFetches++;
        return { ok: true, json: async () => structuredClone(connection) } as Response;
      }
      if (String(input) === "/api/google/locations/selection") {
        onSelect(JSON.parse(String(init?.body)) as unknown);
        return { ok: true, json: async () => ({ selectedLocation: {} }) } as Response;
      }
      throw new Error(`Unexpected settings request ${String(input)}`);
    },
  });
  const page = (loaded.exports.default as () => unknown)();
  const content = findNode(page, (node) => typeof node.type === "function" && node.type.name === "SettingsPageContent");
  assert.ok(content, "settings content component should be present under Suspense");
  const renderContent = () => loaded.render(content.type as () => unknown);
  return { loaded, renderContent, connectionFetchCount: () => connectionFetches };
}

test("Google settings let the owner select a location and refresh the selected state", async () => {
  let selected = false;
  let requestBody: unknown;
  const connection = {
    connected: true,
    canManage: true,
    locations: [{ id: "location-uuid", locationName: "accounts/1/locations/2", title: "Main", primaryCategory: null, isSuspended: false, selected: false }],
  };
  const { loaded, renderContent, connectionFetchCount } = settingsHarness(connection, (body) => {
    requestBody = body;
    selected = true;
    connection.locations[0]!.selected = true;
  });
  renderContent();
  loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = renderContent();
  assert.equal(connectionFetchCount(), 1);
  const select = findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Use this location");
  assert.ok(select);
  (select.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(requestBody, { locationId: "location-uuid" });
  assert.equal(connectionFetchCount(), 2, "successful selection refreshes the connection state");
  // Re-render with the server's updated response, as the state refresh would return it.
  tree = renderContent();
  assert.ok(findNode(tree, (node) => node.type === "span" && textContent(node.props.children) === "Selected"));
  assert.equal(findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Use this location"), undefined);
  assert.equal(selected, true);
});

test("Google settings hide provider mutations from workspace members", async () => {
  const { loaded, renderContent } = settingsHarness({
    connected: true,
    canManage: false,
    locations: [{ id: "location-uuid", locationName: "accounts/1/locations/2", title: "Main", primaryCategory: null, isSuspended: false, selected: true }],
  }, () => assert.fail("members must not submit a location selection"));
  renderContent();
  loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tree = renderContent();
  const disconnect = findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Disconnect Google");
  assert.equal(disconnect?.props.disabled, true);
  assert.equal(findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Use this location"), undefined);
  assert.ok(findNode(tree, (node) => node.type === "span" && textContent(node.props.children) === "Selected"));
});

test("Google settings explain a locked stale selection without offering an API-rejected replacement", async () => {
  const { loaded, renderContent } = settingsHarness({
    connected: true,
    canManage: true,
    selectionLocked: true,
    locations: [{ id: "new-location-uuid", locationName: "accounts/1/locations/3", title: "New location", primaryCategory: null, isSuspended: false, selected: false }],
  }, () => assert.fail("a stale locked selection must not expose replacement selection"));
  renderContent();
  loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tree = renderContent();
  assert.ok(textContent(tree).includes("Your selected location is unavailable."));
  assert.ok(textContent(tree).includes("sync locations again."));
  assert.equal(findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Use this location"), undefined);
});

test("Google Connect is available to the owner and disabled for members", async () => {
  const connection = { connected: false, canManage: true, locations: [] as Array<Record<string, unknown>> };
  const owner = settingsHarness(connection, () => assert.fail("no location request expected"));
  owner.renderContent();
  owner.loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ownerButton = findNode(owner.renderContent(), (node) => node.type === "button" && textContent(node.props.children) === "Connect Google");
  assert.equal(ownerButton?.props.disabled, false);

  const member = settingsHarness({ connected: false, canManage: false, locations: [] }, () => assert.fail("no location request expected"));
  member.renderContent();
  member.loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const memberButton = findNode(member.renderContent(), (node) => node.type === "button" && textContent(node.props.children) === "Connect Google");
  assert.equal(memberButton?.props.disabled, true);
});
