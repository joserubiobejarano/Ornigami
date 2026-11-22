import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { arch, hostname, platform, release } from "node:os";
import { join, resolve } from "node:path";

const MAX_TEXT_BYTES = 256 * 1024;

export type PgStartupFailureInput = {
  label: string;
  pgBin: string;
  port: number;
  dataDir: string;
  logFile: string;
  exitStatus: number | null;
  signal: string | null;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
  command?: string;
  error?: unknown;
};

export type DisposablePgCommandInput = {
  label: string;
  command: string;
  args: string[];
  pgBin: string;
  port: number;
  dataDir: string;
  logFile: string;
  cwd?: string;
};

function bounded(value: unknown): string {
  return String(value ?? "").slice(0, MAX_TEXT_BYTES);
}

function version(command: string, args: string[] = ["--version"]): string {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    return bounded(text || `exit ${result.status ?? "unknown"}`);
  } catch (error) {
    return `unavailable: ${bounded(error instanceof Error ? error.message : error)}`;
  }
}

function listenerEvidence(port: number): string {
  try {
    if (platform() === "linux") {
      const result = spawnSync("ss", ["-ltnp", `sport = :${port}`], {
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      });
      return bounded(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    }
    if (platform() === "win32") {
      const result = spawnSync("netstat", ["-ano"], {
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer: 512 * 1024,
      });
      const lines = `${result.stdout ?? ""}`
        .split(/\r?\n/)
        .filter((line) => line.includes(`:${port}`));
      return bounded(lines.join("\n"));
    }
    return `listener inspection not implemented for ${platform()}`;
  } catch (error) {
    return `listener inspection failed: ${bounded(error instanceof Error ? error.message : error)}`;
  }
}

function ownershipEvidence(paths: string[]): string {
  return paths
    .map((path) => {
      try {
        const stat = statSync(path);
        const kind = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
        return `${path}\t${kind}\tuid=${stat.uid}\tgid=${stat.gid}\tmode=${(stat.mode & 0o777).toString(8)}\tsize=${stat.size}`;
      } catch (error) {
        return `${path}\tmissing-or-unreadable\t${bounded(error instanceof Error ? error.message : error)}`;
      }
    })
    .join("\n");
}

function pgEnvironment(): string {
  const names = [
    "A04_PG_BIN",
    "A06_PG_BIN",
    "A07_PG_BIN",
    "A08_PG_BIN",
    "PG_BIN",
    "PGDATA",
    "PGHOST",
    "PGPORT",
    "PGUSER",
  ];
  return names
    .filter((name) => process.env[name] !== undefined)
    .map((name) => `${name}=${bounded(process.env[name])}`)
    .join("\n");
}

/**
 * Capture bounded disposable-PostgreSQL startup evidence into a directory that
 * is outside the caller's disposable data directory, so it survives `finally`
 * cleanup. No full environment dump and no database contents are retained.
 */
export function capturePgStartupFailure(input: PgStartupFailureInput): string {
  const root = process.env.PG_STARTUP_DIAGNOSTICS_ROOT
    ? resolve(process.env.PG_STARTUP_DIAGNOSTICS_ROOT)
    : resolve(process.cwd(), ".next", "pg-startup-failures");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidenceDir = join(root, `${input.label}-${stamp}-${process.pid}`);
  mkdirSync(evidenceDir, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFileSync(join(evidenceDir, name), bounded(value));

  write(
    "STARTUP_FAILED",
    [
      `label=${input.label}`,
      `timestamp=${new Date().toISOString()}`,
      `hostname=${hostname()}`,
      `platform=${platform()}`,
      `release=${release()}`,
      `arch=${arch()}`,
      `port=${input.port}`,
      `dataDir=${input.dataDir}`,
      `logFile=${input.logFile}`,
      `exitStatus=${input.exitStatus ?? "null"}`,
      `signal=${input.signal ?? "null"}`,
    ].join("\n"),
  );
  write("command.txt", input.command ?? "");
  write("pg_ctl.stdout", input.stdout ?? "");
  write("pg_ctl.stderr", input.stderr ?? "");
  write(
    "error.txt",
    input.error instanceof Error
      ? `${input.error.name}: ${input.error.message}\n${input.error.stack ?? ""}`
      : input.error
        ? String(input.error)
        : "",
  );

  if (existsSync(input.logFile)) {
    writeFileSync(join(evidenceDir, "postgres.log"), readFileSync(input.logFile).subarray(0, MAX_TEXT_BYTES));
  } else {
    write("postgres.log", `missing: ${input.logFile}\n`);
  }

  write("listeners.txt", listenerEvidence(input.port));
  write(
    "ownership.txt",
    ownershipEvidence([
      input.dataDir,
      input.logFile,
      join(input.pgBin, "initdb"),
      join(input.pgBin, "postgres"),
      join(input.pgBin, "pg_ctl"),
      process.cwd(),
      resolve(process.cwd(), ".next"),
    ]),
  );
  write(
    "toolchain.txt",
    [
      `pg_config=${version(join(input.pgBin, "pg_config"))}`,
      `initdb=${version(join(input.pgBin, "initdb"))}`,
      `postgres=${version(join(input.pgBin, "postgres"))}`,
      `psql=${version(join(input.pgBin, "psql"))}`,
      `node=${process.version}`,
      `platform=${platform()}`,
      `arch=${arch()}`,
    ].join("\n"),
  );
  write("pg_env.txt", pgEnvironment());
  return evidenceDir;
}

/**
 * Run initdb/pg_ctl with captured output. On failure, retain startup evidence
 * before the caller's finally removes the disposable directory, then rethrow
 * with the evidence path and the original status/signal.
 */
export function runDisposablePgCommand(input: DisposablePgCommandInput): void {
  const result = spawnSync(input.command, input.args, {
    cwd: input.cwd,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0 && !result.error) return;

  const evidenceDir = capturePgStartupFailure({
    label: input.label,
    pgBin: input.pgBin,
    port: input.port,
    dataDir: input.dataDir,
    logFile: input.logFile,
    exitStatus: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    command: `${input.command} ${input.args.join(" ")}`,
    error: result.error,
  });
  throw new Error(
    `${input.label} failed (exit ${result.status ?? "null"}${result.signal ? `, signal ${result.signal}` : ""}); startup evidence: ${evidenceDir}${result.stderr ? `\n${bounded(result.stderr)}` : ""}`,
  );
}
