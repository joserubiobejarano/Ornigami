import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

function renderNode(type: unknown, props: Record<string, unknown>) { return { type, props }; }
function textContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "props" in value) return textContent((value as { props: { children?: unknown } }).props.children);
  return "";
}

function renderClientWithHooks<TProps extends object>(component: (props: TProps) => unknown, props: TProps, react: Record<string, unknown>): unknown {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const effectDeps: Array<unknown[] | undefined> = [];
  let cursor = 0;
  let pendingEffects: Array<() => void | (() => void)> = [];
  react.useState = (initial: unknown) => {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[index]) : next; }];
  };
  react.useRef = (initial: unknown) => {
    const index = cursor++;
    refs[index] ??= { current: initial };
    return refs[index];
  };
  react.useEffect = (effect: () => void | (() => void), deps?: unknown[]) => {
    const index = cursor++;
    const previous = effectDeps[index];
    if (!previous || !deps || deps.some((value, offset) => !Object.is(value, previous[offset]))) {
      effectDeps[index] = deps;
      pendingEffects.push(effect);
    }
  };

  let tree: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    cursor = 0;
    pendingEffects = [];
    tree = component(props);
    if (!pendingEffects.length) break;
    pendingEffects.forEach((effect) => effect());
  }
  return tree;
}

function loadTsx<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = resolve(relative);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const loaded: { exports: unknown } = { exports: {} };
  const nativeRequire = createRequire(filename);
  const localRequire = (id: string) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@/")) throw new Error(`Unmocked application dependency: ${id}`);
    return nativeRequire(id);
  };
  const execute = vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename }) as
    (require: typeof localRequire, module: { exports: unknown }, exports: unknown) => void;
  execute(localRequire, loaded, loaded.exports);
  return loaded.exports as T;
}

test("Review Booster cron reports unknown/deferred and accounts for reserved quota", async () => {
  const logs: Array<{ event: string; values: Record<string, unknown> }> = [];
  let health: Record<string, unknown> | undefined;
  const businessId = "11111111-1111-4111-8111-111111111111";
  const cron = loadTs<{ GET(request: unknown): Promise<Response> }>("src/app/api/cron/review-booster/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/db/neon": { sql: async () => [{ business_id: businessId }] },
    "@/lib/safe-logger": { safeLogger: { warn: (event: string, values: Record<string, unknown>) => logs.push({ event, values }), error() {} } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/cron-health": {
      acquireCronJobRun: async () => ({ runId: "run-1", fence: 1, cursor: null, deadlineAt: new Date(Date.now() + 60_000), batchLimit: 20, budgetMs: 45_000 }),
      checkpointCronJobRun: async () => undefined,
      finishCronJobRun: async (value: Record<string, unknown>) => { health = value; },
      CronLeaseBusyError: class extends Error { retryAfterSeconds = 10; },
    },
    "@/lib/cron-budget": { providerWindow: () => 8_000 },
    "@/modules/review-booster/services/review-booster-db.service": {
      getReviewBoosterBillingPeriodUsage: async () => ({ sent: 499, used: 500, reserved: 1, allowance: 500 }),
    },
    "@/modules/review-booster/services/followup-runner.service": {
      createFollowupRunnerDependencies: async () => ({}),
      runEligibleFollowups: async () => ({ ok: true, scanned: 3, sent: 0, failed: 0, skipped: 1, unknown: 1, deferred: 1 }),
    },
  });
  const response = await cron.GET({} as never);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 500);
  assert.equal(body.total_unknown, 1);
  assert.equal(body.total_deferred, 1);
  assert.equal(body.total_sent, 0);
  assert.equal(logs[0]?.event, "cron.review_booster.fair_use_limit");
  assert.equal(logs[0]?.values.used, 500);
  assert.equal(logs[0]?.values.sent, 499);
  assert.equal(health?.status, "partial", "unresolved delivery outcomes are visible to cron health");
  assert.equal(health?.failedCount, 1, "unknown outcomes count as failures; expected quota deferrals do not");
});

test("Review Booster quota UI uses reserved usage, explains UTC reset and per-visit expiry", async () => {
  let used = 500;
  let actorRole = "owner";
  let reconciliationFlag = "true";
  const uiMocks = {
    "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" },
    "@/components/dashboard/agent-activation-placeholder": { AgentActivationPlaceholder: "section" },
    "@/lib/auth": { requireUser: async () => ({ user: { id: "user-1", email: "owner@example.com" } }) },
    "@/lib/dashboard-access": { getDashboardAgentAccess: async () => ({
      context: { business: { id: "business-1", name: "Shop" }, role: actorRole }, entitlement: { hasAccess: true },
    }) },
    "@/lib/env": { getOptionalEnv: () => reconciliationFlag },
    "@/lib/format-date": { formatProductDate: (value: string | Date) => String(value) },
    "@/modules/review-booster/components/followups-nav": { FollowupsNav: "nav" },
    "@/modules/review-booster/components/run-followups-button": { RunFollowupsButton: "run-followups" },
    "@/modules/review-booster/components/recent-visits-table": { RecentVisitsTable: "recent-visits-table" },
    "@/modules/review-booster/components/status-badge": { StatusBadge: "span" },
    "@/modules/review-booster/services/review-booster-db.service": {
      getFollowupStats: async () => ({ pending: 0, sent: 10, failed: 0, skipped: 0 }),
      getRecentVisitsPage: async () => ({ items: [{
        id: "visit-1", customer_name: "Customer", customer_email: "customer@example.com", service_name: "Cut",
        visited_at: "2026-10-01T12:00:00.000Z", source: "manual", followup_status: "deferred_quota", error_reason: null,
      }], page: { nextCursor: null, hasMore: false } }),
      getReviewOutcomeStats: async () => ({ requestsSent: 10, reviewsSynced: 0, repliesPosted: 0, linkClicks: 0 }),
      getReviewBoosterBillingPeriodUsage: async () => ({ sent: used - 1, used, reserved: 1, allowance: 500 }),
    },
    "@/components/dashboard": { DashboardCallout: "callout", DashboardPage: "page", DashboardPageHeader: "header" },
    "react/jsx-runtime": { jsx: renderNode, jsxs: renderNode, Fragment: "fragment" },
  };
  const ui = loadTsx<{ BoosterDashboard(props: Record<string, unknown>): unknown }>("src/modules/review-booster/components/booster-dashboard.tsx", uiMocks);
  const pageModule = loadTsx<{ default(): Promise<unknown> }>("src/app/(dashboard)/dashboard/agents/review-booster/page.tsx", {
    ...uiMocks,
    "@/modules/review-booster/components/booster-dashboard": ui,
    "react/jsx-runtime": {
      jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? (type as (props: Record<string, unknown>) => unknown)(props) : renderNode(type, props),
      jsxs: renderNode,
    },
  });
  const tree = await pageModule.default();
  const text = textContent(tree);
  assert.match(text, /500\/500 used/);
  assert.match(text, /UTC reset/);
  assert.match(text, /Unknown deliveries keep their reservation/);
  const findVisits = (value: unknown): { props: Record<string, unknown> } | undefined => {
    if (!value || typeof value !== "object") return undefined;
    if (Array.isArray(value)) return value.map(findVisits).find(Boolean);
    const node = value as { type?: unknown; props?: { children?: unknown } };
    if (node.type === "recent-visits-table") return node as { props: Record<string, unknown> };
    return findVisits(node.props?.children);
  };
  const visitsProps = findVisits(tree)?.props;
  assert.ok(visitsProps, "dashboard renders the bounded RecentVisitsTable component");
  assert.equal(visitsProps?.reconciliationEnabled, true, "provider status checks are enabled only when the server gate is true for an owner");
  actorRole = "member";
  const memberTree = await pageModule.default();
  assert.equal(findVisits(memberTree)?.props.reconciliationEnabled, false, "members never receive the reconciliation affordance");
  actorRole = "owner";
  reconciliationFlag = "false";
  const disabledTree = await pageModule.default();
  assert.equal(findVisits(disabledTree)?.props.reconciliationEnabled, false, "the UI remains closed when provider verification is disabled");
  const react: Record<string, unknown> = {};
  const table = loadTsx<{ RecentVisitsTable(props: Record<string, unknown>): unknown }>("src/modules/review-booster/components/recent-visits-table.tsx", {
    react,
    "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" },
    "@/lib/format-date": { formatProductDate: (value: string | Date) => String(value) },
    "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
    "@/modules/review-booster/components/status-badge": { StatusBadge: ({ status }: { status: string }) => renderNode("badge", { children: status }) },
    "react/jsx-runtime": {
      jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? (type as (value: Record<string, unknown>) => unknown)(props) : renderNode(type, props),
      jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? (type as (value: Record<string, unknown>) => unknown)(props) : renderNode(type, props),
      Fragment: "fragment",
    },
  });
  const tableTree = renderClientWithHooks(table.RecentVisitsTable, visitsProps, react);
  assert.match(textContent(tableTree), /Waiting for monthly quota/);
  assert.match(textContent(tableTree), /Eligibility ends 8 Oct 2026, 12:00 UTC/);
  const findRun = (value: unknown): { props: { disabled: boolean } } | undefined => {
    if (!value || typeof value !== "object") return undefined;
    if (Array.isArray(value)) return value.map(findRun).find(Boolean);
    const node = value as { type?: unknown; props?: { children?: unknown; disabled: boolean } };
    if (node.type === "run-followups") return node as { props: { disabled: boolean } };
    return findRun(node.props?.children);
  };
  assert.equal(findRun(tree)?.props.disabled, false, "deferred-only queues can be retried manually after the UTC reset; SQL enforces eligibility");
  used = 499;
  const almostFull = textContent(await pageModule.default());
  assert.match(almostFull, /499 of 500 requests used/);
  assert.doesNotMatch(almostFull, /Eligible visits wait until/, "one remaining request must not be rounded up to a full allowance");
});

test("Review Booster badges give distinct labels to durable delivery states", () => {
  const badges = loadTsx<{ StatusBadge(input: { status: string }): unknown }>("src/modules/review-booster/components/status-badge.tsx", {
    "react/jsx-runtime": { jsx: renderNode, jsxs: renderNode, Fragment: "fragment" },
  });
  for (const [status, label] of [
    ["accepted", "Accepted by provider"],
    ["sent", "Accepted by provider"],
    ["delayed", "Delivery delayed"],
    ["delivered", "Delivered"],
    ["bounced", "Bounced"],
    ["complained", "Complaint received"],
    ["suppressed", "Suppressed"],
    ["provider_failed", "Provider delivery failed"],
    ["deferred_quota", "Waiting for quota"],
    ["unknown", "Delivery status unknown"],
    ["reconciliation_required", "Needs review"],
    ["expired", "Expired"],
    ["non_sendable", "Not sendable"],
  ]) {
    const badge = badges.StatusBadge({ status }) as { props: { children: string } };
    assert.equal(badge.props.children, label);
  }
});

test("delivery recovery checks only the existing provider email and refreshes metadata only after positive evidence", async () => {
  const react: Record<string, unknown> = {};
  const table = loadTsx<{ RecentVisitsTable(props: Record<string, unknown>): unknown }>("src/modules/review-booster/components/recent-visits-table.tsx", {
    react,
    "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" },
    "@/lib/format-date": { formatProductDate: String },
    "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
    "@/modules/review-booster/components/status-badge": { StatusBadge: "badge" },
    "react/jsx-runtime": { jsx: renderNode, jsxs: renderNode, Fragment: "fragment" },
  });
  const walk = (value: unknown): Array<{ type: string; props: Record<string, unknown> }> => {
    if (Array.isArray(value)) return value.flatMap(walk);
    if (!value || typeof value !== "object" || !("props" in value)) return [];
    const node = value as { type: string; props: Record<string, unknown> };
    return [node, ...walk(node.props.children)];
  };
  const visit = {
    id: "visit-unknown", business_id: "business-1", delivery_id: "40000000-0000-4000-8000-000000000001",
    delivery_status: "pending", delivery_status_at: null, followup_status: "reconciliation_required",
    visited_at: "2026-10-01T12:00:00.000Z", customer_name: "A customer",
  };
  const props = { businessId: "business-1", initialVisits: [visit], initialPage: { nextCursor: null, hasMore: false }, reconciliationEnabled: true };
  const allowedTree = walk(renderClientWithHooks(table.RecentVisitsTable, props, react));
  assert.ok(allowedTree.some((node) => node.type === "input" && node.props.id === "provider-message-visit-unknown"));
  const checkButton = allowedTree.find((node) => node.type === "button" && node.props.children === "Check provider status");
  assert.ok(checkButton, "unresolved owner rows expose a provider-status check");

  const savedFetch = globalThis.fetch;
  try {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
      return Response.json({ status: "unresolved", reason: "provider_not_found" }, { status: 202 });
    }) as typeof fetch;
    (checkButton!.props.onClick as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.length, 1, "202 leaves the existing row and page data untouched");
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "/api/review-booster/deliveries/40000000-0000-4000-8000-000000000001/reconcile");
    assert.deepEqual(JSON.parse(calls[0]!.body!), { businessId: "business-1" }, "provider ID is optional when already stored");

    let malformedCalls = 0;
    globalThis.fetch = (async () => { malformedCalls += 1; return Response.json({}); }) as typeof fetch;
    (checkButton!.props.onClick as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(malformedCalls, 1, "a malformed success cannot claim provider evidence or refresh as resolved");

    const successCalls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      successCalls.push({ url, method });
      if (method === "POST") return Response.json({ status: "resolved", deliveryState: "accepted", deliveryStatus: "delivered" });
      return Response.json({ items: [{ ...visit, followup_status: "sent", delivery_status: "delivered" }], page: { nextCursor: null, hasMore: false } });
    }) as typeof fetch;
    (checkButton!.props.onClick as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(successCalls.map((call) => call.method), ["POST", "GET"], "positive evidence refreshes the page projection without sending another email");
    assert.match(successCalls[1]!.url, /businessId=business-1/);
  } finally {
    globalThis.fetch = savedFetch;
  }

  const closedTree = walk(renderClientWithHooks(table.RecentVisitsTable, { ...props, reconciliationEnabled: false }, {}));
  assert.equal(closedTree.some((node) => node.type === "input" && node.props.id === "provider-message-visit-unknown"), false);
  assert.equal(closedTree.some((node) => node.type === "button" && node.props.children === "Check provider status"), false);

  const terminalTree = walk(renderClientWithHooks(table.RecentVisitsTable, {
    ...props,
    initialVisits: [{ ...visit, id: "visit-terminal", followup_status: "sent", delivery_status: "bounced" }],
  }, {}));
  assert.equal(terminalTree.some((node) => node.type === "button" && node.props.children === "Check provider status"), false, "terminal provider outcomes do not offer a resend/reconciliation action");
  assert.ok(terminalTree.some((node) => node.type === "p" && String(node.props.children).includes("will not be sent again automatically")));
  const terminalBadge = terminalTree.find((node) => node.type === "badge");
  assert.equal(terminalBadge?.props.status, "bounced");
});
