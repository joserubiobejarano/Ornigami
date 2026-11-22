/**
 * Browser launch configuration for the synthetic CI acceptance client.
 *
 * The application container keeps its own read-only, non-root, internal-network
 * containment. Chromium is only the test client that visits the private
 * loopback HTTPS edge. Hosted runners may not provide the user-namespace
 * sandbox, so the sandbox is opt-in and the effective mode is recorded.
 */
export function browserSandboxEnabled(env = process.env) {
  return env.BROWSER_CHROMIUM_SANDBOX === "1";
}

export function browserLaunchOptions(env = process.env) {
  return {
    headless: true,
    chromiumSandbox: browserSandboxEnabled(env),
  };
}
