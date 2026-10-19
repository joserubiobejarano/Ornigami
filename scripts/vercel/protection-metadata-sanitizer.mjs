#!/usr/bin/env node

// Safe capture wrapper for a future, separately authorized read of the
// locallift project protection metadata. Raw CLI output and errors stay in
// memory and are never written, logged, or forwarded.
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

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

  const projectId = typeof value.projectId === 'string' && /^prj_[A-Za-z0-9]+$/.test(value.projectId)
    ? value.projectId
    : null;
  const projectName = value.name === 'locallift' ? 'locallift' : null;
  const bypass = value.protectionBypass;
  if (!projectId || !projectName || !bypass || typeof bypass !== 'object' || Array.isArray(bypass)) {
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
    projectId,
    projectName,
    bypassEntryCount: entryCount,
    automationBypassCount,
  };
}

function main() {
  // Fixed read-only command; no token/secret is accepted as an argument.
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', [
      '/d', '/s', '/c',
      'vercel.cmd project protection locallift --json --no-color --non-interactive',
    ], {
      cwd: tmpdir(),
      encoding: 'utf8',
      maxBuffer: MAX_CAPTURE_BYTES,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name !== 'VERCEL_AUTOMATION_BYPASS_SECRET'),
      ),
    })
    : spawnSync('vercel', [
      'project', 'protection', 'locallift', '--json', '--no-color', '--non-interactive',
    ], {
    cwd: tmpdir(),
    encoding: 'utf8',
    maxBuffer: MAX_CAPTURE_BYTES,
    windowsHide: true,
    // Capture both streams. Only stdout is parsed; stderr is discarded.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name !== 'VERCEL_AUTOMATION_BYPASS_SECRET'),
    ),
    });

  const sanitized = result.error
    ? { status: 'capture_error' }
    : sanitizeCapture({ stdout: result.stdout ?? '', exitCode: result.status ?? 1 });
  process.stdout.write(`${JSON.stringify(sanitized)}\n`);
  if (sanitized.status !== 'ok') process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
