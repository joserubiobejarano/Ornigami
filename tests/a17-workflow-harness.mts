import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

/** Load production TypeScript with aliases and source-relative imports intact. */
export function loadTs<T>(relativePath: string, overrides: Record<string, unknown> = {}): T {
  const projectRoot = process.cwd();
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const loadFile = (filename: string): Record<string, unknown> => {
    const absolutePath = resolve(filename);
    const cached = cache.get(absolutePath);
    if (cached) return cached.exports;
    const source = readFileSync(absolutePath, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: absolutePath,
    }).outputText;
    const mod = { exports: {} as Record<string, unknown> };
    cache.set(absolutePath, mod);
    const sourceRequire = createRequire(absolutePath);
    const localRequire = (id: string): unknown => {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.startsWith("@/")) return loadFile(join(projectRoot, "src", `${id.slice(2)}.ts`));
      if ((id.startsWith("./") || id.startsWith("../")) && id.endsWith(".ts")) return loadFile(resolve(dirname(absolutePath), id));
      return sourceRequire(id);
    };
    const execute = vm.runInNewContext(`(function(exports, require, module) { ${output}\n})`, {
      URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, Buffer, AbortSignal,
      ReadableStream, WritableStream, Blob, process: { ...process, env: { ...process.env } },
      console, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone,
      crypto: globalThis.crypto,
      fetch: async () => { throw new Error("A17 workflow harness blocks network access"); },
    }, { filename: absolutePath }) as
      (exports: object, require: typeof localRequire, module: typeof mod) => void;
    execute(mod.exports, localRequire, mod);
    return mod.exports;
  };
  return loadFile(join(projectRoot, relativePath)) as T;
}
