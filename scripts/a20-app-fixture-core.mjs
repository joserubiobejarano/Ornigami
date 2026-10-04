import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveFixturePath(fixtureRoot, targetPath) {
  const root = resolve(fixtureRoot);
  const target = resolve(targetPath);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("refusing a path outside the A20 fixture root");
  }
  return target;
}

export function validateA20Marker(marker, expected) {
  if (!marker || marker.task !== "A20" || marker.version !== 1 || marker.state !== "ready"
      || marker.database !== expected.database || marker.host !== "127.0.0.1"
      || marker.port !== expected.port || marker.fixtureRoot !== expected.fixtureRoot
      || marker.clusterPath !== expected.clusterPath) {
    throw new Error("A20 fixture marker identity failed");
  }
}

export function isExpectedA20App(commandLine, { preload, nextBin }) {
  const normalized = commandLine?.toLowerCase();
  const preloadPath = preload.toLowerCase();
  const preloadUrl = pathToFileURL(preload).href.toLowerCase();
  return Boolean(normalized && /(?:^|[\\/\s])node(?:\.exe)?(?:["\s]|$)/.test(normalized)
    && normalized.includes("next")
    && normalized.includes("start")
    && (normalized.includes(preloadPath) || normalized.includes(preloadUrl))
    && normalized.includes(nextBin.toLowerCase()));
}

export function baseA20ChildEnv(inherited, { appPort, preload }) {
  const env = {};
  for (const key of ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"]) {
    if (inherited[key]) env[key] = inherited[key];
  }
  const normalizedPreload = pathToFileURL(preload).href;
  return {
    ...env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(appPort),
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${appPort}`,
    AUTH_URL: `http://127.0.0.1:${appPort}`,
    NEXTAUTH_URL: `http://127.0.0.1:${appPort}`,
    NODE_OPTIONS: `--import=${normalizedPreload}`,
  };
}
