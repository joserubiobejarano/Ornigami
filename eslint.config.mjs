import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "builder-runtime/.next/**",
    "builder-runtime/public/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "migration-sources/**",
    ".a20-fixture/**",
    ".local/**",
  ]),
]);

export default eslintConfig;
