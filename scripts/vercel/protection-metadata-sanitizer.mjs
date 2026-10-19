#!/usr/bin/env node

// Safe capture wrapper for a separately authorized read of locallift
// protection metadata. Raw child output is kept in memory and never returned.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pinned from the trusted local .vercel/project.json link; never discover these
// identifiers by broadening a provider read from this wrapper.
export const EXPECTED_PROJECT_ID = 'prj_b4ud7KOZHWQeV9YXbGD3c8XMmKIv';
export const EXPECTED_OWNER_SCOPE_ID = 'team_ImIhBTUn2FAzpaDiocEM0aT4';
const PROJECT_NAME = 'locallift';
const CAPTURE_TIMEOUT_MS = 20_000;
const TREE_KILL_TIMEOUT_MS = 3_000;
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export function buildVercelArgs() {
  return [
    '--scope', EXPECTED_OWNER_SCOPE_ID,
    'project', 'protection', EXPECTED_PROJECT_ID,
    '--json', '--no-color', '--non-interactive',
  ];
}

export function buildInvocation(platform = process.platform, appData = process.env.APPDATA) {
  const args = buildVercelArgs();
  if (platform !== 'win32') return { command: 'vercel', args };
  if (typeof appData !== 'string' || appData.length === 0) return { status: 'launch_error' };
  const cliEntry = join(appData, 'npm', 'node_modules', 'vercel', 'dist', 'vc.js');
  if (!existsSync(cliEntry)) return { status: 'launch_error' };
  return {
    command: process.execPath,
    args: [cliEntry, ...args],
  };
}

export function sanitizeCapture({ stdout = '', exitCode = 0 } = {}) {
  if (!Number.isInteger(exitCode)) return { status: 'capture_error' };
  if (exitCode !== 0) return { status: 'cli_error', exitCode };

  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    return { status: 'invalid_response' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { status: 'invalid_response' };
  }
  if (value.projectId !== EXPECTED_PROJECT_ID || value.name !== PROJECT_NAME) {
    return { status: 'project_mismatch' };
  }

  const bypass = value.protectionBypass;
  if (!bypass || typeof bypass !== 'object' || Array.isArray(bypass)) {
    return { status: 'unrecognized_schema' };
  }

  let entryCount = 0;
  let automationBypassCount = 0;
  for (const entry of Object.values(bypass)) {
    entryCount += 1;
    if (entry && typeof entry === 'object' && entry.scope === 'automation-bypass') {
      automationBypassCount += 1;
    }
  }

  return {
    status: 'ok',
    projectId: EXPECTED_PROJECT_ID,
    projectName: PROJECT_NAME,
    bypassEntryCount: entryCount,
    automationBypassCount,
  };
}

function killProcessTree(child, platform) {
  if (!child.pid) return { killed: true };
  if (platform === 'win32') {
    // taskkill /T terminates the CLI process and any descendants. Resolve it
    // only from the Windows system directory.
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    const taskkill = systemRoot ? join(systemRoot, 'System32', 'taskkill.exe') : null;
    const result = taskkill && existsSync(taskkill)
      ? spawnSync(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      timeout: TREE_KILL_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      })
      : null;
    if (result?.status === 0) return { killed: true };
    // The Windows CLI is launched directly with Node (no cmd.exe shim), so
    // this fallback cannot leave the CLI running under an orphaned shell.
    try {
      child.kill('SIGKILL');
    } catch {
      // The fixed cleanup-failure status below is the only surfaced detail.
    }
    return { killed: false };
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
    return { killed: true };
  } catch {
    try {
      child.kill('SIGKILL');
      return { killed: true };
    } catch {
      return { killed: false };
    }
  }
}

function capture(command, args, {
  timeoutMs = CAPTURE_TIMEOUT_MS,
  maxBytes = MAX_CAPTURE_BYTES,
  platform = process.platform,
  spawnImpl = spawn,
  cwd = tmpdir(),
  env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      !['VERCEL_AUTOMATION_BYPASS_SECRET', 'NODE_OPTIONS'].includes(name.toUpperCase()),
    ),
  ),
} = {}) {
  return new Promise((resolveCapture) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        cwd,
        env,
        detached: platform !== 'win32',
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolveCapture({ status: 'launch_error' });
      return;
    }

    let stoppedFor = null;
    let cleanupSucceeded = true;
    let outputBytes = 0;
    const stdout = [];
    const stderr = [];
    let timer;
    let cleanupTimer;

    const stop = (reason) => {
      if (stoppedFor) return;
      stoppedFor = reason;
      const result = killProcessTree(child, platform);
      cleanupSucceeded = result.killed;
      // On Windows, even taskkill is time bounded. Do not wait indefinitely
      // for a broken child implementation after the tree termination attempt.
      cleanupTimer = setTimeout(() => {
        resolveCapture({ status: `${reason}_cleanup_failed` });
      }, TREE_KILL_TIMEOUT_MS + 250);
    };

    const collect = (target, chunk) => {
      if (stoppedFor) return;
      const bytes = Buffer.byteLength(chunk);
      outputBytes += bytes;
      if (outputBytes > maxBytes) {
        stop('buffer_limit');
        return;
      }
      target.push(Buffer.from(chunk));
    };

    child.stdout.on('data', (chunk) => collect(stdout, chunk));
    child.stderr.on('data', (chunk) => collect(stderr, chunk));
    child.on('error', () => {
      if (!stoppedFor) stoppedFor = 'launch_error';
    });
    timer = setTimeout(() => {
      stop('timeout');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
      if (stoppedFor) {
        resolveCapture({ status: cleanupSucceeded ? stoppedFor : `${stoppedFor}_cleanup_failed` });
        return;
      }
      if (code === null) {
        resolveCapture({ status: 'launch_error' });
        return;
      }
      resolveCapture({
        status: 'captured',
        stdout: Buffer.concat(stdout).toString('utf8'),
        exitCode: code,
      });
    });
  });
}

export async function runSanitizedCapture(command, args, options = {}) {
  const captured = await capture(command, args, options);
  if (captured.status !== 'captured') return { status: captured.status };
  return sanitizeCapture({ stdout: captured.stdout, exitCode: captured.exitCode });
}

async function main() {
  const invocation = buildInvocation();
  const result = invocation.status
    ? { status: invocation.status }
    : await runSanitizedCapture(invocation.command, invocation.args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'ok') process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.stdout.write('{"status":"capture_error"}\n');
    process.exitCode = 2;
  });
}
