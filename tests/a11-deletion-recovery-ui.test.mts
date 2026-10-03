import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type VNode = { type: unknown; props: Record<string, unknown> };
function loadForm(onSignOut: () => Promise<void> = async () => {}) {
  const file = resolve("src/app/account/deletion/deletion-form.tsx");
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const hookState: unknown[] = [];
  let hookIndex = 0;
  const React = { useState(initial: unknown) {
    const index = hookIndex++;
    if (!(index in hookState)) hookState[index] = initial;
    return [hookState[index], (value: unknown) => { hookState[index] = value; }] as const;
  } };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const moduleState: { exports: Record<string, unknown> } = { exports: {} };
  const nativeRequire = createRequire(file);
  const requireForModule = ((id: string) => id === "react" ? React
      : id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
      : id === "next-auth/react" ? { signOut: onSignOut }
        : nativeRequire(id)) as NodeJS.Require;
  const execute = vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: file }) as
    (require: NodeJS.Require, module: { exports: Record<string, unknown> }, exports: Record<string, unknown>) => void;
  execute(requireForModule, moduleState, moduleState.exports);
  const component = moduleState.exports.default as (props: { initialState: "none" | "pending" | "confirmation" | "complete" }) => VNode;
  return (initialState: "none" | "pending" | "confirmation" | "complete") => {
    hookIndex = 0;
    return component({ initialState });
  };
}
function nodes(node: unknown): VNode[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  const current = node as VNode;
  return [current, ...nodes(current.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return text((node as VNode).props.children);
}
function control(tree: VNode, tag: string, predicate: (props: Record<string, unknown>) => boolean): VNode {
  const result = nodes(tree).find((node) => node.type === tag && predicate(node.props));
  assert.ok(result, `expected ${tag} control`);
  return result;
}

test("deletion recovery reload is actionable and keeps 202/409/503/network/200 states safe", async () => {
  const originalFetch = globalThis.fetch;
  let signOuts = 0;
  let navigated = "";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const runResponse = async (initialState: "none" | "pending" | "confirmation", response: Response | Error) => {
    const Form = loadForm();
    const fetchImpl = async () => { if (response instanceof Error) throw response; return response; };
    globalThis.fetch = fetchImpl as typeof fetch;
    let tree = Form(initialState);
    if (initialState === "none") {
      const input = control(tree, "input", (props) => props.id === "deletion-confirmation");
      (input.props.onChange as (event: unknown) => void)({ target: { value: "DELETE MY DATA" } });
      tree = Form(initialState);
    }
    const activeButton = control(tree, "button", () => true);
    assert.equal(activeButton.props.disabled, false, "pending page reload keeps retry button enabled");
    await (activeButton.props.onClick as () => Promise<void>)();
    tree = Form(initialState);
    return { tree };
  };

  try {
    const pendingPage = loadForm()("pending");
    const retry = control(pendingPage, "button", () => true);
    assert.match(text(retry.props.children), /Retry deletion/);
    assert.equal(retry.props.disabled, false, "server-proven frozen operation pre-fills the explicit retry phrase");

    const accepted = await runResponse("pending", Response.json({ ok: false, recoverable: true }, { status: 202 }));
    assert.match(text(accepted.tree), /still processing/);
    assert.match(text(control(accepted.tree, "button", () => true).props.children), /Retry deletion/);

    let confirmationResponses = 0;
    globalThis.fetch = (async () => ++confirmationResponses === 1
      ? Response.json({ error: "Confirm workspace deletion", confirmationRequired: true }, { status: 409 })
      : Response.json({ ok: false, recoverable: true }, { status: 202 })) as typeof fetch;
    const Form = loadForm(); let tree = Form("none");
    const confirmationInput = control(tree, "input", (props) => props.id === "deletion-confirmation");
    (confirmationInput.props.onChange as (event: unknown) => void)({ target: { value: "DELETE MY DATA" } });
    tree = Form("none");
    await (control(tree, "button", () => true).props.onClick as () => Promise<void>)();
    tree = Form("none");
    assert.match(text(tree), /workspace and its team data/);
    const checkbox = control(tree, "input", (props) => props.type === "checkbox");
    (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    tree = Form("none");
    assert.equal(control(tree, "button", () => true).props.disabled, false);
    await (control(tree, "button", () => true).props.onClick as () => Promise<void>)();
    tree = Form("none");
    assert.match(text(tree), /still processing/);

    const unavailable = await runResponse("pending", Response.json({ error: "temporarily unavailable" }, { status: 503 }));
    assert.match(text(unavailable.tree), /temporarily unavailable/);
    assert.match(text(control(unavailable.tree, "button", () => true).props.children), /Retry deletion/);

    const lost = await runResponse("pending", new Error("connection lost"));
    assert.match(text(lost.tree), /could not confirm the result/);
    assert.match(text(control(lost.tree, "button", () => true).props.children), /Retry deletion/);

    const expired = await runResponse("pending", Response.json({ error: "Unauthorized" }, { status: 401 }));
    assert.match(text(expired.tree), /session ended before we could confirm/);
    assert.equal(control(expired.tree, "button", () => true).props.disabled, true,
      "a missing-user session cannot retry or silently start a new account");

    globalThis.fetch = (async () => Response.json({ ok: true }, { status: 200 })) as typeof fetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { replace: (path: string) => { navigated = path; } } } });
    const successForm = loadForm(async () => { signOuts++; }); const completedTree = successForm("pending");
    await (control(completedTree, "button", () => true).props.onClick as () => Promise<void>)();
    assert.equal(signOuts, 1, "confirmed deletion signs out Auth.js");
    assert.equal(navigated, "/", "confirmed deletion signs out before leaving the recovery view");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
