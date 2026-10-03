import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

type MockSentry = {
  init: (options: Record<string, unknown>) => void;
  getClient: () => object | undefined;
  withScope: (callback: (scope: Record<string, (...args: never[]) => unknown>) => void) => void;
  captureException: (error: Error) => void;
  captureRouterTransitionStart: (href: string, navigationType: string) => void;
};
type TestModule = { exports: Record<string, unknown> };

function createHarness({ path, dsn, environment = "production", existingClient, failFirstInitialization = false }: {
  path: string;
  dsn?: string;
  environment?: string;
  existingClient?: object;
  failFirstInitialization?: boolean;
}) {
  const environmentVariables = process.env as Record<string, string | undefined>;
  const originalDsn = environmentVariables.NEXT_PUBLIC_SENTRY_DSN;
  const originalEnvironment = environmentVariables.NODE_ENV;
  if (dsn === undefined) delete environmentVariables.NEXT_PUBLIC_SENTRY_DSN;
  else environmentVariables.NEXT_PUBLIC_SENTRY_DSN = dsn;
  environmentVariables.NODE_ENV = environment;

  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = { pathname: path, href: `https://ornigami.test${path}` };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location } });

  let client = existingClient;
  let sentryImports = 0;
  let initCalls = 0;
  const initOptions: Array<Record<string, unknown>> = [];
  const transitions: Array<[string, string]> = [];
  let eventProcessor: ((event: Record<string, unknown>) => Record<string, unknown>) | undefined;
  const sentry: MockSentry = {
    getClient: () => client,
    init: (options) => {
      initCalls += 1;
      initOptions.push(options);
      if (failFirstInitialization && initCalls === 1) throw new Error("SDK init failed");
      client = {};
    },
    withScope: (callback) => callback({
      clear: () => undefined,
      setLevel: () => undefined,
      addEventProcessor: (processor: (event: Record<string, unknown>) => Record<string, unknown>) => {
        eventProcessor = processor;
      },
    }),
    captureException: () => {
      eventProcessor?.({ event_id: "test", exception: { values: [{ value: "source" }] } });
    },
    captureRouterTransitionStart: (href, navigationType) => transitions.push([href, navigationType]),
  };

  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (relative: string): Record<string, unknown> => {
    const filename = resolve(relative);
    const cached = cache.get(filename);
    if (cached) return cached.exports;

    const source = readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    const loadedModule: TestModule = { exports: {} };
    cache.set(filename, loadedModule);
    const nativeRequire = createRequire(filename);
    const localRequire = (id: string): unknown => {
      if (id === "@sentry/nextjs") {
        sentryImports += 1;
        return sentry;
      }
      if (id === "@/lib/sentry-options") return { SENTRY_OPTIONS: { sendDefaultPii: false } };
      if (id === "@/lib/sentry-client") return load("src/lib/sentry-client.ts");
      if (id.startsWith("@/")) throw new Error(`Unexpected application dependency: ${id}`);
      return nativeRequire(id);
    };
    const wrapper = vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename }) as
      (require: (id: string) => unknown, module: TestModule, exports: Record<string, unknown>) => void;
    wrapper(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };

  return {
    load,
    location,
    get sentryImports() { return sentryImports; },
    get initCalls() { return initCalls; },
    initOptions,
    transitions,
    restore() {
      if (originalDsn === undefined) delete environmentVariables.NEXT_PUBLIC_SENTRY_DSN;
      else environmentVariables.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
      if (originalEnvironment === undefined) delete environmentVariables.NODE_ENV;
      else environmentVariables.NODE_ENV = originalEnvironment;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else delete (globalThis as unknown as Record<string, unknown>).window;
    },
  };
}

test("public boundary then protected router transition share one client and keep public traces off", async () => {
  const harness = createHarness({ path: "/", dsn: "https://public@example.test/1" });
  try {
    const visibility = harness.load("src/lib/error-visibility.ts") as {
      captureBoundaryError: (error: Error, boundary: "route") => Promise<void>;
    };
    await visibility.captureBoundaryError(new Error("private source"), "route");
    assert.equal(harness.initCalls, 1);
    assert.equal((harness.initOptions[0].tracesSampler as () => number)(), 0);

    const instrumentation = harness.load("instrumentation-client.ts") as {
      onRouterTransitionStart: (href: string, navigationType: string) => void;
    };
    harness.location.pathname = "/dashboard";
    harness.location.href = "https://ornigami.test/dashboard";
    assert.equal((harness.initOptions[0].tracesSampler as () => number)(), 0.1);
    instrumentation.onRouterTransitionStart("/dashboard", "push");
    await Promise.resolve();

    assert.equal(harness.initCalls, 1, "router instrumentation reuses the boundary-created client");
    assert.equal(JSON.stringify(harness.transitions), JSON.stringify([["/dashboard", "push"]]));
  } finally {
    harness.restore();
  }
});

test("protected instrumentation and a concurrent boundary capture initialize only once", async () => {
  const harness = createHarness({ path: "/reviews/123", dsn: "https://public@example.test/1" });
  try {
    const instrumentation = harness.load("instrumentation-client.ts") as {
      onRouterTransitionStart: (href: string, navigationType: string) => void;
    };
    const visibility = harness.load("src/lib/error-visibility.ts") as {
      captureBoundaryError: (error: Error, boundary: "global") => Promise<void>;
    };

    const capture = visibility.captureBoundaryError(new Error("private source"), "global");
    instrumentation.onRouterTransitionStart("/dashboard", "replace");
    await capture;
    await Promise.resolve();

    assert.equal(harness.initCalls, 1, "top-level init and concurrent boundary capture share the pending promise");
    assert.equal(harness.sentryImports, 1);
    assert.equal((harness.initOptions[0].tracesSampler as () => number)(), 0.1);
    assert.equal(JSON.stringify(harness.transitions), JSON.stringify([["/dashboard", "replace"]]));
  } finally {
    harness.restore();
  }
});

test("public routes and missing DSN do not load the SDK; a pre-existing client is reused", async () => {
  const publicHarness = createHarness({ path: "/", dsn: undefined });
  try {
    publicHarness.load("instrumentation-client.ts");
    const visibility = publicHarness.load("src/lib/error-visibility.ts") as {
      captureBoundaryError: (error: Error, boundary: "global") => Promise<void>;
    };
    await visibility.captureBoundaryError(new Error("private source"), "global");
    assert.equal(publicHarness.sentryImports, 0);
    assert.equal(publicHarness.initCalls, 0);
  } finally {
    publicHarness.restore();
  }

  const configuredPublicHarness = createHarness({ path: "/contact", dsn: "https://public@example.test/1" });
  try {
    configuredPublicHarness.load("instrumentation-client.ts");
    assert.equal(configuredPublicHarness.sentryImports, 0, "ordinary public navigation stays lazy even with a DSN");
    assert.equal(configuredPublicHarness.initCalls, 0);
  } finally {
    configuredPublicHarness.restore();
  }

  const existingClient = {};
  const initializedHarness = createHarness({
    path: "/settings/profile",
    dsn: "https://public@example.test/1",
    existingClient,
  });
  try {
    const instrumentation = initializedHarness.load("instrumentation-client.ts") as {
      onRouterTransitionStart: (href: string, navigationType: string) => void;
    };
    instrumentation.onRouterTransitionStart("/settings/profile", "traverse");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(initializedHarness.initCalls, 0);
    assert.equal(JSON.stringify(initializedHarness.transitions), JSON.stringify([["/settings/profile", "traverse"]]));
  } finally {
    initializedHarness.restore();
  }
});

test("failed SDK initialization is caught and retried on a later protected transition", async () => {
  const harness = createHarness({
    path: "/dashboard",
    dsn: "https://public@example.test/1",
    failFirstInitialization: true,
  });
  try {
    const instrumentation = harness.load("instrumentation-client.ts") as {
      onRouterTransitionStart: (href: string, navigationType: string) => void;
    };
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.initCalls, 1, "the eager protected-route attempt failed");

    instrumentation.onRouterTransitionStart("/reviews/123", "push");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(harness.initCalls, 2, "the rejected shared promise was cleared for another attempt");
    assert.equal(JSON.stringify(harness.transitions), JSON.stringify([["/reviews/123", "push"]]));
  } finally {
    harness.restore();
  }
});
