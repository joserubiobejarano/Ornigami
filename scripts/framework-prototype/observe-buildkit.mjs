import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { freemem } from 'node:os';
import { pathToFileURL } from 'node:url';

export const observationKeys = 'memory.max memory.swap.max memory.current memory.peak memory.events memory.events.local memory.stat memory.pressure cpu.max cpu.stat pids.current pids.max';

export function observationScript({ cgroupRoot = '/sys/fs/cgroup', procRoot = '/proc' } = {}) {
  const keys = observationKeys;
  return `for k in ${keys}; do printf '==%s==\\n' "$k"; cat "${cgroupRoot}/$k" || exit 1; done
printf '==owned-process-memory==\\n'
for p in "${procRoot}"/[0-9]*; do
  [ -d "$p" ] || continue
  for file in status smaps_rollup; do
    [ "$file" = smaps_rollup ] && [ ! -r "$p/$file" ] && continue
    if [ ! -r "$p/$file" ]; then
      printf '==proc-sample-skipped== %s/%s unreadable-or-disappeared\\n' "$p" "$file"
      continue
    fi
    sample=$(grep -E '^(Name|Pid|PPid|VmRSS|VmHWM|Threads|Rss|Pss|Private_Clean|Private_Dirty):' "$p/$file" 2>&1)
    sample_status=$?
    if [ "$sample_status" -eq 0 ]; then
      printf '%s\\n' "$sample"
    else
      printf '==proc-sample-skipped== %s/%s read-error status=%s\\n' "$p" "$file" "$sample_status"
      printf '%s\\n' "$sample" >&2
    fi
  done
done
exit 0`;
}

async function main() {
  const [, , container, out, stop] = process.argv;
  if (!/^[0-9a-f]{64}$/.test(container ?? '')) throw Error('Exact owned container ID required');
  if (process.argv[5] && process.argv[5] !== 'toolchain') throw Error('Unknown owned observation purpose');
  const observationScope = process.argv[5] === 'toolchain' ? 'owned toolchain compiler PID namespace only; no arguments or environment collected' : 'owned BuildKit PID namespace only; no arguments or environment collected';
  const script = observationScript();
  const started = Date.now(); let sequence = 0;
  do {
    const final = fs.existsSync(stop);
    const result = spawnSync('docker', ['exec', container, 'sh', '-c', script], { encoding: 'utf8', timeout: 1800, maxBuffer: 1024 * 1024 });
    fs.appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), sequence: sequence++, containerId: container, final, hostAvailableBytes: freemem(), exit: result.status, signal: result.signal, metrics: result.stdout ?? '', error: result.stderr ?? result.error?.message ?? '', scope: observationScope }) + '\n');
    if (final) break;
    if (!fs.existsSync(stop)) await new Promise(r => setTimeout(r, 2000));
  } while (Date.now() - started < 24 * 60 * 1000);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
