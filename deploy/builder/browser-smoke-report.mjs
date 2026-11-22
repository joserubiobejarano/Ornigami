const MAX_TEXT = 64 * 1024;

function bounded(value) {
  return String(value ?? "").slice(0, MAX_TEXT);
}

/**
 * Build the bounded browser-smoke report. The report records the effective
 * identity/paths/mode and startup failure text; it never dumps the environment.
 */
export function buildBrowserSmokeReport({
  ok,
  error = null,
  stderr = "",
  screenshot = null,
  executablePath = null,
  browserVersion = null,
  startedAt,
  finishedAt,
  env = process.env,
  uid = process.getuid?.(),
  gid = process.getgid?.(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  tmpdir,
  writable = {},
  launchOptions = {},
}) {
  return {
    schemaVersion: 1,
    status: ok ? "passed" : "failed",
    ok: Boolean(ok),
    effectiveUid: uid ?? null,
    effectiveGid: gid ?? null,
    home: env.HOME ?? null,
    xdgConfigHome: env.XDG_CONFIG_HOME ?? null,
    xdgCacheHome: env.XDG_CACHE_HOME ?? null,
    tmpdir: tmpdir ?? null,
    timezone,
    writable,
    browserMode: launchOptions.chromiumSandbox === true ? "sandbox" : "no-sandbox",
    sandbox: launchOptions.chromiumSandbox === true ? "sandbox" : "no-sandbox",
    launchOptions,
    executablePath,
    browserVersion,
    screenshot,
    startedAt,
    finishedAt,
    error: error
      ? {
          name: error.name ?? "Error",
          message: bounded(error.message),
          stack: bounded(error.stack),
        }
      : null,
    stderr: bounded(stderr),
  };
}
