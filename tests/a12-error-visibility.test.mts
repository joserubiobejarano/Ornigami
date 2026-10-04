import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import vm from "node:vm";
import { loadTs } from "./a02-test-support.mts";

type ErrorVisibility = typeof import("../src/lib/error-visibility.ts");
const expectPublicSamplingDisabled = () => 0;

function loadTsx<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = resolve(relative);
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  const loaded: { exports: unknown } = { exports: {} };
  const nativeRequire = createRequire(filename);
  const localRequire = (id: string): unknown => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id);
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename }) as
    (require: (id: string) => unknown, module: { exports: unknown }, exports: unknown) => void;
  wrapper(localRequire, loaded, loaded.exports);
  return loaded.exports as T;
}

test("boundary capture sends only a fixed error and safe correlation metadata", async () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.test/1";

  const captured: Array<{ error: Error; event: Record<string, unknown> }> = [];
  let client: object | undefined;
  let eventProcessor: ((event: Record<string, unknown>) => Record<string, unknown>) | undefined;
  const sentry = {
    getClient: () => client,
    init: (options: Record<string, unknown>) => {
      assert.deepEqual(options, {
        dsn: "https://public@example.test/1",
        enabled: true,
        tracesSampler: expectPublicSamplingDisabled,
        sendDefaultPii: false,
      });
      client = {};
    },
    withScope: (callback: (scope: Record<string, (...args: never[]) => unknown>) => void) => callback({
      clear: () => undefined,
      setLevel: () => undefined,
      addEventProcessor: (processor: (event: Record<string, unknown>) => Record<string, unknown>) => {
        eventProcessor = processor;
      },
    }),
    captureException: (error: Error) => {
      assert.ok(eventProcessor);
      const event = eventProcessor({
        event_id: "event-id",
        timestamp: 1,
        platform: "javascript",
        sdk: { name: "sentry.javascript.browser" },
        release: "release",
        environment: "test",
        user: { email: "customer@example.com" },
        request: { url: "https://example.test/path?token=secret", cookies: "session-secret" },
        breadcrumbs: [{ message: "private review text" }],
        contexts: { browser: { url: "https://example.test/?email=customer@example.com" } },
        extra: { provider_response: "private-provider-response" },
        exception: { values: [{ type: "Error", value: "source secret" }] },
        tags: { tenant: "customer@example.com" },
        transaction: "/private/route",
      });
      captured.push({ error, event });
    },
  };
  const { captureBoundaryError } = loadTs<ErrorVisibility>("src/lib/error-visibility.ts", {
    "@/lib/sentry-client": {
      getOrInitializeSentryClient: async () => {
        if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null;
        if (!client) sentry.init({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          enabled: true,
          tracesSampler: expectPublicSamplingDisabled,
          sendDefaultPii: false,
        });
        return sentry;
      },
    },
  });

  try {
    const secret = "customer@example.com authorization=Bearer-secret review text";
    const source = Object.assign(new Error(secret), {
      digest: "123456789",
      token: "private-token",
      responseBody: "private-provider-response",
    });
    await captureBoundaryError(source, "global");
    await captureBoundaryError(source, "global");

    assert.equal(captured.length, 1, "the same boundary error is reported once");
    assert.equal(captured[0].error.message, "Ornigami global error boundary caught an error");
    assert.doesNotMatch(captured[0].error.stack ?? "", /customer@example|Bearer-secret|review text/);
    assert.deepEqual(captured[0].event.tags, {
      error_boundary: "global",
      error_digest: "123456789",
    });
    assert.deepEqual(captured[0].event.fingerprint, ["ornigami-error-boundary", "global", "123456789"]);
    assert.deepEqual(captured[0].event.exception, {
      values: [{ type: "Error", value: "Ornigami global error boundary caught an error" }],
    });
    const serialized = JSON.stringify(captured);
    assert.doesNotMatch(serialized, /customer@example|Bearer-secret|review text|private-token|private-provider-response|session-secret|source secret|private\/route/);
    assert.equal("request" in captured[0].event, false);
    assert.equal("user" in captured[0].event, false);
    assert.equal("breadcrumbs" in captured[0].event, false);
    assert.equal("contexts" in captured[0].event, false);
    assert.equal("extra" in captured[0].event, false);
  } finally {
    if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  }
});

test("fallback copy provides recovery and support without claiming an alert was sent", () => {
  const { ERROR_FALLBACK_COPY } = loadTs<ErrorVisibility>("src/lib/error-visibility.ts", {
    "@/lib/sentry-client": { getOrInitializeSentryClient: async () => null },
  });

  assert.match(ERROR_FALLBACK_COPY.message, /Try loading it again/);
  assert.match(ERROR_FALLBACK_COPY.support, /contact us/);
  assert.equal(ERROR_FALLBACK_COPY.retry, "Try again");
  assert.doesNotMatch(Object.values(ERROR_FALLBACK_COPY).join(" "), /notified|we've been told|we will reply/i);
});

test("invalid correlation data is safely ignored when telemetry has no client", async () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  const { captureBoundaryError } = loadTs<ErrorVisibility>("src/lib/error-visibility.ts", {
    "@/lib/sentry-client": { getOrInitializeSentryClient: async () => null },
  });

  try {
    await captureBoundaryError(Object.assign(new Error("private"), { digest: "email@example.com" }), "route");
  } finally {
    if (originalDsn !== undefined) process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  }
});

test("rendered root fallback includes document tags and its real retry and contact actions", () => {
  const copy = loadTs<ErrorVisibility>("src/lib/error-visibility.ts", {
    "@/lib/sentry-client": { getOrInitializeSentryClient: async () => null },
  }).ERROR_FALLBACK_COPY;
  let retries = 0;
  const retry = () => { retries += 1; };
  const fallbackModule = loadTsx<{ ErrorFallback: (props: { error: Error; retry: () => void; boundary: "route" | "global" }) => ReactElement }>(
    "src/app/error-fallback.tsx",
    {
      react: { useEffect: (effect: () => void) => effect() },
      "@/lib/error-visibility": { captureBoundaryError: () => Promise.resolve(), ERROR_FALLBACK_COPY: copy },
    },
  );
  const globalErrorModule = loadTsx<{ default: (props: { error: Error; retry: () => void }) => ReactElement }>(
    "src/app/global-error.tsx",
    { "@/app/error-fallback": fallbackModule },
  );

  const rendered = renderToStaticMarkup(globalErrorModule.default({ error: new Error("private detail"), retry }));
  assert.match(rendered, /^<html lang="en"><head><\/head><body/);
  assert.match(rendered, /<button[^>]*>Try again<\/button>/);
  assert.match(rendered, /<a href="\/contact"[^>]*>Contact support<\/a>/);
  assert.match(rendered, /<a href="\/"[^>]*>Go home<\/a>/);
  assert.doesNotMatch(rendered, /notified|private detail/);

  const fallbackTree = fallbackModule.ErrorFallback({ error: new Error("private detail"), retry, boundary: "global" });
  const findButton = (node: ReactNode): ReactElement<{ onClick?: () => void }> | undefined => {
    for (const child of Children.toArray(node)) {
      if (isValidElement(child) && child.type === "button") {
        return child as ReactElement<{ onClick?: () => void }>;
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        const nested = findButton(child.props.children);
        if (nested) return nested;
      }
    }
    return undefined;
  };
  const button = findButton(fallbackTree as ReactNode);
  assert.ok(button);
  button.props.onClick?.();
  assert.equal(retries, 1);
});

test("Booster's nested boundary reports through the sanitized helper and keeps recovery usable", () => {
  const source = Object.assign(new Error("private review text token=secret"), { digest: "123456" });
  const captures: Array<[Error, string]> = [];
  let retries = 0;
  const boosterModule = loadTsx<{ default: (props: { error: Error; retry: () => void }) => ReactElement<{ children: ReactNode }> }>(
    "src/app/(dashboard)/dashboard/agents/review-booster/error.tsx",
    {
      react: { useEffect: (effect: () => void) => effect() },
      "@/lib/error-visibility": {
        captureBoundaryError: async (error: Error, boundary: string) => { captures.push([error, boundary]); },
      },
      "@/components/ui/button": { Button: (props: { onClick: () => void; children: ReactNode }) => createElement("button", props) },
    },
  );
  const tree = boosterModule.default({ error: source, retry: () => { retries += 1; } });
  assert.deepEqual(captures, [[source, "route"]]);
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /Review Booster could not load/);
  assert.match(markup, /Retry dashboard/);
  assert.doesNotMatch(markup, /private review|token=secret|123456|notified/i);
  const button = Children.toArray(tree.props.children).find(child => isValidElement<{ onClick?: () => void }>(child) && child.props.onClick);
  assert.ok(isValidElement<{ onClick: () => void }>(button));
  button.props.onClick();
  assert.equal(retries, 1);
});
