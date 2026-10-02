import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

export type SqlCall = { query: string; values: unknown[] };
export function fakeSql(getRows: (query: string, values: unknown[]) => unknown[]) {
  const calls: SqlCall[] = [];
  const sql = (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""), "");
    calls.push({ query, values });
    return Promise.resolve(getRows(query, values));
  };
  return { sql, calls };
}

/** Executes production modules with explicit mocks at DB/auth/provider boundaries. */
export function loadTs<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = resolve(relative);
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  const loaded: { exports: unknown } = { exports: {} };
  const nativeRequire = createRequire(filename);
  const localRequire = (id: string): unknown => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@/")) throw new Error(`Unmocked application dependency: ${id}`);
    return nativeRequire(id);
  };
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename }) as
    (require: (id: string) => unknown, module: { exports: unknown }, exports: unknown) => void;
  wrapper(localRequire, loaded, loaded.exports);
  return loaded.exports as T;
}
