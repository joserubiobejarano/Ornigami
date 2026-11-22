/**
 * Browser launch configuration for the synthetic CI acceptance client.
 *
 * The application container keeps its own read-only, non-root, internal-network
 * containment. Chromium is only the test client that visits the private
 * loopback HTTPS edge. Hosted runners may not provide the user-namespace
 * sandbox, so the sandbox is opt-in and the effective mode is recorded.
 *
 * Only explicit "0" (no sandbox) and "1" (sandbox) are accepted. Silently
 * treating an unsupported value as "no sandbox" would hide a configuration
 * mistake in an acceptance receipt.
 */
export function parseBrowserSandbox(value) {
  if (value === undefined || value === null || value === "" || value === "0") {
    return false;
  }
  if (value === "1") return true;
  throw new Error(
    `BROWSER_CHROMIUM_SANDBOX must be "0" or "1"; got ${JSON.stringify(value)}`,
  );
}

export function browserSandboxEnabled(env = process.env) {
  return parseBrowserSandbox(env.BROWSER_CHROMIUM_SANDBOX);
}

export function browserMode(env = process.env) {
  return browserSandboxEnabled(env) ? "sandbox" : "no-sandbox";
}

export function browserLaunchOptions(env = process.env) {
  return {
    headless: true,
    chromiumSandbox: browserSandboxEnabled(env),
  };
}
