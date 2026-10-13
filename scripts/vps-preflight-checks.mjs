const DEFAULT_PATHS = Object.freeze({
  appRoot: "/opt/ornigami/current",
  envFile: "/etc/ornigami/runtime.env",
  envDirectory: "/etc/ornigami",
  serviceFile: "/etc/systemd/system/ornigami.service",
  cronServiceFile: "/etc/systemd/system/ornigami-cron@.service",
  cronTimerFiles: [
    "/etc/systemd/system/ornigami-cron-review-booster.timer",
    "/etc/systemd/system/ornigami-cron-review-replies.timer",
    "/etc/systemd/system/ornigami-cron-privacy.timer",
  ],
  caddyFile: "/etc/caddy/Caddyfile",
  cacheDirectory: "/opt/ornigami/current/.next/cache",
  flockBinary: "/usr/bin/flock",
});

/**
 * Structural preflight. The runtime env file is checked only through metadata;
 * its contents are deliberately never opened or parsed here.
 */
export function collectVpsPreflight({
  platform,
  existsSync,
  statSync,
  spawnSync,
  paths = DEFAULT_PATHS,
}) {
  const problems = [];
  const check = (condition, message) => { if (!condition) problems.push(message); };
  const run = (command, args) => spawnSync(command, args, { encoding: "utf8", stdio: "ignore" });
  const available = (command, args) => run(command, args).status === 0;

  const serviceNode = spawnSync("/usr/bin/node", ["--version"], { encoding: "utf8" });
  const serviceNodeMajor = serviceNode.status === 0
    ? serviceNode.stdout.trim().replace(/^v/, "").split(".")[0]
    : "missing";
  check(platform === "linux", "run this preflight on the target Linux VPS");
  check(serviceNodeMajor === "22", `systemd runtime /usr/bin/node must be Node.js 22.x; found ${serviceNodeMajor}`);
  check(existsSync(`${paths.appRoot}/.next/BUILD_ID`), `production build missing at ${paths.appRoot}/.next/BUILD_ID`);
  check(existsSync(`${paths.appRoot}/node_modules/next/dist/bin/next`), `Next.js CLI missing under ${paths.appRoot}/node_modules`);
  check(existsSync(paths.cacheDirectory), `Next.js cache directory missing at ${paths.cacheDirectory}`);
  check(available("systemctl", ["--version"]), "systemd systemctl is unavailable");
  check(available("caddy", ["version"]), "Caddy is unavailable");
  check(available("id", ["-u", "ornigami"]), "unprivileged ornigami service account is missing");
  check(available(paths.flockBinary, ["--version"]), `flock is unavailable at ${paths.flockBinary}`);
  check(existsSync(paths.serviceFile), `install the app unit at ${paths.serviceFile}`);
  check(existsSync(paths.cronServiceFile), `install the cron service at ${paths.cronServiceFile}`);
  for (const timerFile of paths.cronTimerFiles) {
    check(existsSync(timerFile), `install the cron timer at ${timerFile}`);
  }
  check(existsSync(paths.caddyFile), `install the Caddy configuration at ${paths.caddyFile}`);
  check(run("runuser", ["--user", "ornigami", "--", "test", "-w", paths.cacheDirectory]).status === 0,
    `ornigami service account cannot write to ${paths.cacheDirectory}`);

  try {
    const envStat = statSync(paths.envFile);
    check(envStat.isFile(), `${paths.envFile} must be a regular file`);
    check(envStat.uid === 0, `${paths.envFile} must be owned by root`);
    check((envStat.mode & 0o777) === 0o600, `${paths.envFile} must have mode 0600`);
  } catch {
    check(false, `required root-owned runtime environment file is missing: ${paths.envFile}`);
  }

  try {
    const dirStat = statSync(paths.envDirectory);
    check(dirStat.isDirectory(), `${paths.envDirectory} must be a directory`);
    check(dirStat.uid === 0, `${paths.envDirectory} must be owned by root`);
    check((dirStat.mode & 0o022) === 0, `${paths.envDirectory} must not be group or world writable`);
  } catch {
    check(false, `required root-owned ${paths.envDirectory} directory is missing`);
  }

  if (available("systemd-analyze", ["--version"])) {
    check(run("systemd-analyze", ["verify", paths.serviceFile, paths.cronServiceFile, ...paths.cronTimerFiles]).status === 0,
      "systemd unit validation failed; inspect systemd-analyze output locally");
  } else {
    check(false, "systemd-analyze is unavailable for unit validation");
  }

  if (available("caddy", ["version"])) {
    check(run("caddy", ["validate", "--config", paths.caddyFile, "--adapter", "caddyfile"]).status === 0,
      "Caddy configuration validation failed; inspect caddy validate output locally");
  }

  return {
    problems,
    notes: [
      "Runtime environment contents were not opened or inspected; verify required integrations separately.",
      "If ISR or generateStaticParams is introduced, review Next.js cache write permissions under .next/server.",
    ],
  };
}
