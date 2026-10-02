import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

import { authPageHref, getAuthReturnPath } from "../src/lib/auth-return-path.ts";
import { invitationEmailMatches, resolveInvitationRedirect } from "../src/lib/team-invitation-flow.ts";

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
  const localRequire = (id: string) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    return nativeRequire(id);
  };
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${compiled}\n})`, {
    URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, Buffer, AbortSignal,
    ReadableStream, WritableStream, Blob, process, fetch: (overrides.__fetch as typeof fetch | undefined) ?? fetch,
    window: overrides.__window, console, setTimeout, clearTimeout, setInterval, clearInterval,
  }) as (exports: object, require: typeof localRequire, module: typeof mod) => void;
  execute(mod.exports, localRequire, mod);
  function render(component: () => unknown): unknown { cursor = 0; return component(); }
  function runEffects() { for (const effect of effects) effect?.(); }
  return { exports: mod.exports, render, runEffects };
}

function findNode(tree: unknown, predicate: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
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

function searchParams(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] ?? null };
}

test("invitation login and signup callbacks return to the same invite page", () => {
  const invitationPath = "/team/invite/abc_123-xyz";
  const loginHref = authPageHref("/login", invitationPath);
  const signupHref = authPageHref("/signup", invitationPath);

  assert.equal(new URL(loginHref, "https://ornigami.example").searchParams.get("callbackUrl"), invitationPath);
  assert.equal(new URL(signupHref, "https://ornigami.example").searchParams.get("callbackUrl"), invitationPath);
  assert.equal(getAuthReturnPath(searchParams({ callbackUrl: invitationPath })), invitationPath);
});

test("legacy signup invite query still resolves to the acceptance page", () => {
  assert.equal(getAuthReturnPath(searchParams({ invite: "abc_123-xyz" })), "/team/invite/abc_123-xyz");
});

test("acceptance is limited to the invited email address, case insensitively", () => {
  assert.equal(invitationEmailMatches("Person@Example.com", "person@example.com"), true);
  assert.equal(invitationEmailMatches("person@example.com", "someone@example.com"), false);
  assert.equal(invitationEmailMatches("person@example.com", null), false);
});

test("acceptance redirect only permits a safe same-origin local destination", () => {
  assert.equal(resolveInvitationRedirect("/dashboard/agents/review-replies/settings?team=accepted", "https://ornigami.example"), "/dashboard/agents/review-replies/settings?team=accepted");
  assert.equal(resolveInvitationRedirect("//evil.example/path", "https://ornigami.example"), null);
  assert.equal(resolveInvitationRedirect("https://evil.example/path", "https://ornigami.example"), null);
  assert.equal(resolveInvitationRedirect("/\\evil.example", "https://ornigami.example"), null);
});

test("signup UI sends the invitation callback through registration and Google sign-in", async () => {
  const invitationPath = "/team/invite/abc_123-xyz";
  const params = new URLSearchParams(`callbackUrl=${encodeURIComponent(invitationPath)}`);
  const captured: { registrationBody: Record<string, unknown> | null; googleOptions: Record<string, unknown> | null } = {
    registrationBody: null,
    googleOptions: null,
  };
  const loaded = componentHarness("src/app/(auth)/signup/page.tsx", {
    "next/navigation": { useSearchParams: () => params },
    "next-auth/react": { signIn: async (_provider: string, options: Record<string, unknown>) => { captured.googleOptions = options; } },
    "@/lib/auth-return-path": { getAuthReturnPath, authPageHref },
    "@/lib/auth-password-policy": { isValidAuthPassword: (value: unknown) => typeof value === "string" && value.length >= 8 && Buffer.byteLength(value, "utf8") <= 72 },
    "next/image": "img",
    "next/link": "a",
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    __fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured.registrationBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return { ok: true, json: async () => ({ ok: true, message: "Verification sent" }) } as Response;
    },
  });
  const page = (loaded.exports.default as () => unknown)();
  const signupElement = findNode(page, (node) => typeof node.type === "function" && node.type.name === "SignupForm");
  assert.ok(signupElement);
  const renderSignup = () => loaded.render(signupElement.type as () => unknown);

  let tree = renderSignup();
  for (const [id, value] of [
    ["signup-name", "Invited Person"],
    ["signup-email", "invited@example.com"],
    ["signup-password", "password123"],
    ["signup-confirm-password", "password123"],
  ]) {
    const input = findNode(tree, (node) => node.type === "input" && node.props.id === id);
    assert.ok(input, `expected ${id} field`);
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    tree = renderSignup();
  }
  const form = findNode(tree, (node) => node.type === "form");
  assert.ok(form);
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
  assert.equal((captured.registrationBody as Record<string, unknown> | null)?.callbackUrl, invitationPath);
  assert.equal((captured.registrationBody as Record<string, unknown> | null)?.email, "invited@example.com");

  tree = renderSignup();
  const googleButton = findNode(tree, (node) => node.type === "button" && node.props.children === "Continue with Google");
  assert.ok(googleButton);
  await (googleButton.props.onClick as () => Promise<void>)();
  assert.equal((captured.googleOptions as Record<string, unknown> | null)?.callbackUrl, invitationPath);
});

test("acceptance UI posts for JSON, follows only success, and renders API errors", async () => {
  const destinations: string[] = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let apiResult: { ok: boolean; body: Record<string, unknown> } = {
    ok: true,
    body: { ok: true, redirectTo: "/dashboard/agents/review-replies/settings?team=accepted" },
  };
  const loaded = componentHarness("src/components/team/accept-invitation-button.tsx", {
    "@/components/ui/button": { Button: "button" },
    "@/lib/team-invitation-flow": { resolveInvitationRedirect },
    __window: { location: { origin: "https://ornigami.example", assign: (destination: string) => destinations.push(destination) } },
    __fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return { ok: apiResult.ok, json: async () => apiResult.body } as Response;
    },
  });
  const component = loaded.exports.AcceptInvitationButton as (props: { token: string }) => unknown;
  let tree = loaded.render(() => component({ token: "secret-token" }));
  const accept = findNode(tree, (node) => node.type === "button");
  assert.ok(accept);
  await (accept.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests[0]?.url, "/api/team/invitations/secret-token");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("accept"), "application/json");
  assert.deepEqual(destinations, ["/dashboard/agents/review-replies/settings?team=accepted"]);

  apiResult = { ok: false, body: { error: "This invitation has expired." } };
  tree = loaded.render(() => component({ token: "secret-token" }));
  const retry = findNode(tree, (node) => node.type === "button");
  assert.ok(retry);
  await (retry.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = loaded.render(() => component({ token: "secret-token" }));
  const message = findNode(tree, (node) => node.props.role === "alert");
  assert.equal(message?.props.children, "This invitation has expired.");
  assert.equal(destinations.length, 1, "failed acceptance must not navigate into dashboard provisioning");
});

test("owner team UI enforces full seats and removes a member after confirmation", async () => {
  let fixture = {
    role: "owner",
    hasCompleteAccess: true,
    canManage: true,
    seatLimit: 3,
    invitationDays: 7,
    members: [
      { user_id: "owner-id", email: "owner@example.com", name: "Owner", role: "owner" },
      { user_id: "member-a", email: "a@example.com", name: "A", role: "member" },
      { user_id: "member-b", email: "b@example.com", name: "B", role: "member" },
    ],
    pendingInvitations: [],
  };
  const mutations: Array<{ url: string; method: string }> = [];
  const loaded = componentHarness("src/components/dashboard/team-members-card.tsx", {
    "next/link": "a",
    "@/components/dashboard/callout": { DashboardCallout: "aside" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardDescription: "p", CardHeader: "header", CardTitle: "h2" },
    "@/components/ui/input": { Input: "input" },
    __window: { setInterval: () => 1, clearInterval: () => undefined },
    __fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        mutations.push({ url, method });
        fixture = { ...fixture, members: fixture.members.filter((member) => member.user_id !== "member-a") };
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, json: async () => fixture } as Response;
    },
  });
  const component = loaded.exports.TeamMembersCard as () => unknown;
  loaded.render(component);
  loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = loaded.render(component);
  const fullSeatButton = findNode(tree, (node) => node.type === "button" && node.props.children === "Seat limit reached");
  assert.equal(fullSeatButton?.props.disabled, true);

  const removeButton = findNode(tree, (node) => node.type === "button" && node.props.children === "Remove");
  assert.ok(removeButton);
  (removeButton.props.onClick as () => void)();
  tree = loaded.render(component);
  const confirm = findNode(tree, (node) => node.type === "button" && node.props.children === "Confirm removal");
  assert.ok(confirm);
  (confirm.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(mutations[0], { url: "/api/team/members/member-a", method: "DELETE" });
  tree = loaded.render(component);
  assert.equal(findNode(tree, (node) => node.props.role === "status")?.props.children, "Member removed from this workspace.");
  assert.equal(textContent(findNode(tree, (node) => node.type === "span" && textContent(node.props.children).includes("/3 users"))), "2/3 users");
});

test("downgraded owner retains member and invitation cleanup controls", async () => {
  let fixture = {
    role: "owner",
    hasCompleteAccess: false,
    canManage: true,
    seatLimit: 3,
    invitationDays: 7,
    members: [
      { user_id: "owner-id", email: "owner@example.com", name: "Owner", role: "owner" },
      { user_id: "member-a", email: "a@example.com", name: "A", role: "member" },
    ],
    pendingInvitations: [{ id: "invitation-id", email: "invite@example.com", expires_at: "2099-05-01T00:00:00.000Z" }],
  };
  const mutations: Array<{ url: string; method: string }> = [];
  const loaded = componentHarness("src/components/dashboard/team-members-card.tsx", {
    "next/link": "a",
    "@/components/dashboard/callout": { DashboardCallout: "aside" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardDescription: "p", CardHeader: "header", CardTitle: "h2" },
    "@/components/ui/input": { Input: "input" },
    __window: { setInterval: () => 1, clearInterval: () => undefined },
    __fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        mutations.push({ url, method });
        fixture = { ...fixture, pendingInvitations: [] };
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, json: async () => fixture } as Response;
    },
  });
  const component = loaded.exports.TeamMembersCard as () => unknown;
  loaded.render(component);
  loaded.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = loaded.render(component);
  assert.ok(findNode(tree, (node) => node.type === "button" && node.props.children === "Remove"));
  const revoke = findNode(tree, (node) => node.type === "button" && node.props.children === "Revoke");
  assert.ok(revoke);
  assert.equal(findNode(tree, (node) => node.type === "form"), undefined, "invitation creation stays gated off Complete");
  (revoke.props.onClick as () => void)();
  tree = loaded.render(component);
  const confirm = findNode(tree, (node) => node.type === "button" && node.props.children === "Confirm revoke");
  assert.ok(confirm);
  (confirm.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(mutations[0], { url: "/api/team/invitations/invitation-id", method: "DELETE" });
});

test("invite page renders only live pending invitations and keeps signup on the invite callback", async () => {
  const invitation: { value: { email: string; business_name: string } | null } = { value: null };
  let session: { user: { id: string; email: string } } | null = null;
  const queries: string[] = [];
  const loaded = componentHarness("src/app/team/invite/[token]/page.tsx", {
    "next/link": "a",
    "@/auth": { auth: async () => session },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardDescription: "p", CardHeader: "header", CardTitle: "h2" },
    "@/components/team/accept-invitation-button": { AcceptInvitationButton: "button" },
    "@/lib/team": { hashTeamInvitationToken: () => "hashed-token" },
    "@/lib/auth-return-path": { authPageHref },
    "@/lib/team-invitation-flow": { invitationEmailMatches },
    "@/lib/db/neon": {
      sql: async (parts: TemplateStringsArray) => {
        const query = parts.join("?");
        queries.push(query);
        return invitation.value ? [invitation.value] : [];
      },
    },
  });
  const page = loaded.exports.default as (input: { params: Promise<{ token: string }> }) => Promise<unknown>;
  const props = { params: Promise.resolve({ token: "invite-token" }) };

  let tree = await page(props);
  assert.ok(textContent(tree).includes("This invitation is no longer available."));
  assert.match(queries[0]!, /status\s*=\s*'pending'/);
  assert.match(queries[0]!, /expires_at\s*>\s*now\(\)/);

  invitation.value = { email: "invite@example.com", business_name: "Workspace" };
  tree = await page(props);
  assert.ok(textContent(tree).includes("You have been invited to Workspace."));
  const login = findNode(tree, (node) => node.type === "a" && node.props.children === "Log in to accept");
  const signup = findNode(tree, (node) => node.type === "a" && node.props.children === "Create an account");
  assert.equal(new URL(String(login?.props.href), "https://ornigami.example").searchParams.get("callbackUrl"), "/team/invite/invite-token");
  assert.equal(new URL(String(signup?.props.href), "https://ornigami.example").searchParams.get("callbackUrl"), "/team/invite/invite-token");

  session = { user: { id: "invitee-id", email: "INVITE@example.com" } };
  tree = await page(props);
  assert.ok(findNode(tree, (node) => node.type === "button" && node.props.token === "invite-token"));
  assert.equal(queries.length, 3, "invite rendering reads invitation state without provisioning a business");
});
