import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
function jsx(type: unknown, props: Record<string, unknown>) { return { type, props }; }

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

function settingsHarness(input: { fetch: (url: string, init?: RequestInit) => Promise<Response> }) {
  const nativeRequire = createRequire(import.meta.url);
  let cursor = 0;
  const state: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const React = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [state[index] as T, (value) => { state[index] = typeof value === "function" ? (value as (current: T) => T)(state[index] as T) : value; }];
    },
    useEffect(effect: () => void | (() => void)) { const index = cursor++; if (!effects[index]) effects[index] = effect; },
  };
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/modules/review-booster/components/followups-nav": { FollowupsNav: "nav" },
    "@/modules/review-booster/components/page-header": { PageHeader: "header" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/lib/form-controls": { nativeSelectClassName: "select" },
  };
  const source = readFileSync(resolve("src/modules/review-booster/pages/settings-page.tsx"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const localRequire = (id: string) => Object.hasOwn(modules, id) ? modules[id] : nativeRequire(id);
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${compiled}\n})`, {
    URL, URLSearchParams, Request, Response, TextEncoder, TextDecoder, Buffer, process, console,
    fetch: input.fetch, setTimeout, clearTimeout,
  }) as (exports: object, require: typeof localRequire, module: typeof mod) => void;
  execute(mod.exports, localRequire, mod);
  const Page = mod.exports.default as () => unknown;
  return {
    render() { cursor = 0; return Page(); },
    runEffects() { for (const effect of effects) effect?.(); },
  };
}

function settings(selected: string | null, locations: Array<{ id: string; title: string; selected: boolean }>, canManage = true) {
  return {
    id: "business-1", businessId: "business-1", name: "Studio", business_type: "Salon",
    google_review_url: null, rebooking_url: null, email_from_name: null, tone: "warm and friendly", language: "en",
    google_profile_connected: true, google_profile_locations: locations.map((location) => ({
      id: location.id, title: location.title, review_url: null, primary_category: null, selected: location.selected,
    })), selected_location_id: selected, auto_google_review_url: null,
    google_review_url_valid: true, rebooking_url_valid: true, can_manage_settings: canManage,
  };
}

test("Booster owner selects the first canonical location, keeps it pinned, and omits selection from settings save", async () => {
  let selected: string | null = null;
  let locations = [{ id: "location-a", title: "Main clinic", selected: false }, { id: "location-b", title: "Second clinic", selected: false }];
  let selectionRequest: Record<string, unknown> | null = null;
  const settingsSaves: Array<Record<string, unknown>> = [];
  const harness = settingsHarness({ fetch: async (url, init) => {
    if ((url === "/api/review-booster/settings" || url === "/api/review-booster/settings?businessId=business-1") && init?.method !== "POST") {
      return Response.json(settings(selected, locations));
    }
    if (url === "/api/google/locations/selection" && init?.method === "POST") {
      selectionRequest = JSON.parse(String(init.body)) as Record<string, unknown>;
      selected = String(selectionRequest.locationId);
      locations = locations.map((location) => ({ ...location, selected: location.id === selected }));
      return Response.json({ selectedLocation: { id: selected } });
    }
    if (url === "/api/review-booster/settings" && init?.method === "POST") {
      settingsSaves.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json(settings(selected, locations));
    }
    throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
  } });

  harness.render();
  harness.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = harness.render();
  const chooser = findNode(tree, (node) => node.type === "select" && textContent(node.props.children).includes("Select a location"));
  assert.ok(chooser, "owner with no current selection gets an explicit location chooser");
  const initialForm = findNode(tree, (node) => node.type === "form");
  assert.ok(initialForm);
  await (initialForm.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
  assert.equal("selected_location_id" in settingsSaves[0]!, false, "a no-selection save does not submit an arbitrary empty selection");
  assert.equal(settingsSaves[0]!.businessId, "business-1");

  tree = harness.render();
  const currentChooser = findNode(tree, (node) => node.type === "select" && textContent(node.props.children).includes("Select a location"));
  assert.ok(currentChooser);
  (currentChooser.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "location-b" } });
  tree = harness.render();
  const selectButton = findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Use this location");
  assert.ok(selectButton);
  (selectButton.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(selectionRequest, { businessId: "business-1", locationId: "location-b" });
  tree = harness.render();
  assert.ok(textContent(tree).includes("Selected location: Second clinic. This selection is pinned for this business."));
  assert.ok(textContent(tree).includes("Save settings to use its review link."));
  assert.equal(findNode(tree, (node) => node.type === "select" && textContent(node.props.children).includes("Select a location")), undefined);

  const form = findNode(tree, (node) => node.type === "form");
  assert.ok(form);
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
  const settingsSave = settingsSaves[1];
  assert.ok(settingsSave);
  assert.equal("selected_location_id" in settingsSave, false, "settings POST cannot replace the pinned resource");
  assert.equal(settingsSave.businessId, "business-1");
  assert.equal(settingsSave.google_review_url, "", "the selected review URL is persisted only after the explicit settings save");
});

test("Booster members read the selected location without selection or settings mutation controls", async () => {
  let posts = 0;
  const harness = settingsHarness({
    fetch: async (url, init) => {
      if (url === "/api/review-booster/settings") return Response.json(settings("location-a", [{ id: "location-a", title: "Main clinic", selected: true }], false));
      if (init?.method === "POST") posts++;
      throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
    },
  });
  harness.render();
  harness.runEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tree = harness.render();
  assert.ok(textContent(tree).includes("Only the business owner can change Review Booster settings."));
  assert.ok(textContent(tree).includes("Selected location: Main clinic. This selection is pinned for this business."));
  assert.equal(findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Use this location"), undefined);
  assert.equal(findNode(tree, (node) => node.type === "button" && textContent(node.props.children) === "Manage selected Google location"), undefined);
  assert.equal(posts, 0);
});
