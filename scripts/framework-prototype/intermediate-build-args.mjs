export function intermediateBuildArguments({ origin, sourceSha }) {
  if (typeof origin !== 'string' || !/^https:\/\//.test(origin)) throw new Error('Approved public origin is required');
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) throw new Error('Exact admitted source SHA is required');
  return [
    '--build-arg', 'NEXT_PUBLIC_APP_URL=' + origin,
    '--build-arg', 'ORNIGAMI_PRIVATE_STAGING_MODE=true',
    '--build-arg', 'ORNIGAMI_PRIVATE_STAGING_PLATFORM=coolify',
    '--build-arg', 'ORNIGAMI_SOURCE_SHA=' + sourceSha,
    '--build-arg', 'ORNIGAMI_BUILD_HEAP_MIB=4096',
    '--build-arg', 'ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=true',
    '--build-arg', 'ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false',
    '--build-arg', 'ORNIGAMI_BUILD_WEBPACK_WORKER=false',
  ];
}
