import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

export type HarnessOptions = {
  overrides?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
};
const nativeRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();

export function loadTs<T>(relativePath: string, options: HarnessOptions = {}): T {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const overrides = options.overrides ?? {};
  const localProcess = { ...process, env: { ...process.env, ...options.env } };
  const localFetch: typeof fetch = options.fetch ?? (async () => { throw new Error("test harness blocks network access"); });
  const resolveModule = (id: string): unknown => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id.startsWith("@/")) return loadFile(join(projectRoot, "src", `${id.slice(2)}.ts`));
    return nativeRequire(id);
  };
  const loadFile = (absolutePath: string): Record<string, unknown> => {
    const key = resolve(absolutePath);
    const existing = cache.get(key);
    if (existing) return existing.exports;
    const js = ts.transpileModule(readFileSync(key, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    type CjsModule = { exports: Record<string, unknown> };
    const mod: CjsModule = { exports: {} };
    cache.set(key, mod);
    const req = (id: string) => resolveModule(id);
    const run = vm.runInNewContext(`(function(exports, require, module) { ${js}\n})`, {
      URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, Buffer, AbortSignal,
      ReadableStream, WritableStream, Blob, process: localProcess, fetch: localFetch, console,
      setTimeout, clearTimeout, setInterval, clearInterval,
    }) as (exports: object, require: typeof req, module: CjsModule) => void;
    run(mod.exports, req, mod);
    return mod.exports;
  };
  return loadFile(join(projectRoot, relativePath)) as T;
}

export function nextServerWithAfter(after: (task: () => Promise<void>) => void) {
  return { ...nativeRequire("next/server") as Record<string, unknown>, after };
}

export function realBcryptWithCounter(onHash: () => void) {
  const bcrypt = nativeRequire("bcryptjs") as { hash(value: string, rounds: number): Promise<string>; compare(value: string, hash: string): Promise<boolean> };
  return { ...bcrypt, hash: async (value: string, rounds: number) => { onHash(); return bcrypt.hash(value, rounds); } };
}
