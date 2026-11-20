import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const [mode, ...args] = process.argv.slice(2);
if (!["build", "smoke", "start", "dev", "node"].includes(mode)) {
  throw new Error(
    "Usage: node scripts/builder-runtime-qualify.mjs build|smoke|start|dev|node [arguments]",
  );
}
if (existsSync(".env.local") || existsSync(".env")) {
  throw new Error("Builder qualification requires no dotenv files");
}

const logDirectory = resolve(".local/builder-runtime");
mkdirSync(logDirectory, { recursive: true });
const eventLog = resolve(logDirectory, `${mode}-events.jsonl`);
rmSync(eventLog, { force: true });

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3041";
const env = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  WINDIR: process.env.WINDIR,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  USERPROFILE: process.env.USERPROFILE,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  APPDATA: process.env.APPDATA,
  ComSpec: process.env.ComSpec,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_APP_URL: baseUrl,
  ...(mode === "dev" ? {} : { NODE_ENV: "production" }),
  NODE_OPTIONS: `--require="${resolve("scripts/support/offline-guard.cjs").replaceAll("\\", "/")}"`,
  ORNIGAMI_OFFLINE_LOG: eventLog,
};

const nextBin = resolve("node_modules/next/dist/bin/next");
const commands = {
  build: [
    [process.execPath, "scripts/builder-runtime-public.mjs"],
    [process.execPath, nextBin, "build", "builder-runtime", "--webpack"],
    [process.execPath, "scripts/finalize-sri-manifest.mjs", "builder-runtime"],
    [process.execPath, "scripts/generate-static-csp-hashes.mjs", "builder-runtime"],
  ],
  smoke: [[process.execPath, "scripts/builder-runtime-smoke.mjs"]],
  start: [
    [process.execPath, "scripts/builder-runtime-public.mjs"],
    [
      process.execPath,
      nextBin,
      "start",
      "builder-runtime",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3041",
    ],
  ],
  dev: [
    [process.execPath, "scripts/builder-runtime-public.mjs"],
    [
      process.execPath,
      nextBin,
      "dev",
      "builder-runtime",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3041",
    ],
  ],
  node: [[process.execPath, ...args]],
};

const run = (argv) =>
  new Promise((done, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => done(code ?? 1));
  });

let code = 0;
for (const command of commands[mode]) {
  code = await run(command);
  if (code !== 0) break;
}

let denied = 0;
if (existsSync(eventLog)) {
  for (const line of readFileSync(eventLog, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      if (JSON.parse(line).event === "denied") denied += 1;
    } catch {
      // A partial log line is not evidence of egress.
    }
  }
}
console.log(`Builder runtime ${mode}: denied egress attempts = ${denied}`);
if (code === 0 && denied > 0) code = 2;
process.exitCode = code;
