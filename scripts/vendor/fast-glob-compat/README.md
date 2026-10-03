# Local `fast-glob` compatibility adapter

This first-party package uses the `fast-glob` module name at an explicit local version (`0.0.0-ornigami.1`). It replaces the upstream dependency in the development lint graph with a small compatibility adapter. It delegates globbing to the already locked `tinyglobby` package and does not include upstream `fast-glob` code, `braces`, or `micromatch`.

The current locked consumers use only these forms:

- Next.js 16.3.8 calls `globSync(pattern, { onlyDirectories: true })` for configured Next root directories.
- TypeScript-ESTree 8.46.3 calls `sync(pattern, { cwd, ignore })` for each TypeScript project glob.

The adapter supports a single string pattern, `cwd`, `onlyDirectories`, positive ignore patterns, and the TypeScript-ESTree ignore-list convention in which exclusions are prefixed with `!`. It preserves absolute results for absolute patterns, uses non-directory-expanding mode, removes tinyglobby's trailing slash from directory results, and rejects malformed option values or unknown options so a future caller change cannot be silently ignored.

This is not a general replacement for the complete `fast-glob` API. The dependency override must be removed or re-reviewed if either locked consumer changes its call shape.
