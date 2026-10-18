#!/usr/bin/env bash
# Shared deadline primitives for the disconnected runtime acceptance harness.

ornigami_deadline_init() {
  local now
  local work_deadline=${ORNIGAMI_WORK_DEADLINE_EPOCH:-}
  [[ $work_deadline =~ ^[0-9]{1,12}$ ]] || {
    printf 'ORNIGAMI_WORK_DEADLINE_EPOCH must be a Unix epoch in seconds.\n' >&2
    return 2
  }
  command -v timeout >/dev/null || {
    printf 'GNU timeout is required for bounded runtime commands.\n' >&2
    return 2
  }
  now=$(date +%s) || return 2
  (( work_deadline > now )) || {
    printf 'Runtime work deadline is exhausted.\n' >&2
    return 2
  }
  ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS=120
  ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS=20
  (( work_deadline - now >= ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS + 30 )) || {
    printf 'Runtime work deadline leaves insufficient acceptance and cleanup budget.\n' >&2
    return 2
  }
  ORNIGAMI_RUNTIME_DEADLINE_EPOCH=$((work_deadline - ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS))
  ORNIGAMI_CLEANUP_DEADLINE_EPOCH=$work_deadline
  ORNIGAMI_DEADLINE_PHASE=runtime
  ORNIGAMI_DEADLINE_TIMED_OUT=false
  ORNIGAMI_COMMAND_TIMED_OUT=false
}

ornigami_deadline_set_cleanup() {
  ORNIGAMI_DEADLINE_PHASE=cleanup
}

ornigami_deadline_check_runtime() {
  local now
  now=$(date +%s) || return 125
  if (( now >= ORNIGAMI_RUNTIME_DEADLINE_EPOCH )); then
    ORNIGAMI_DEADLINE_TIMED_OUT=true
    ORNIGAMI_COMMAND_TIMED_OUT=true
    return 124
  fi
}

ornigami_deadline_run() {
  local now deadline remaining cap duration status
  deadline=$ORNIGAMI_RUNTIME_DEADLINE_EPOCH
  [[ $ORNIGAMI_DEADLINE_PHASE == cleanup ]] && deadline=$ORNIGAMI_CLEANUP_DEADLINE_EPOCH
  now=$(date +%s) || return 125
  remaining=$((deadline - now))
  if (( remaining <= 2 )); then
    ORNIGAMI_COMMAND_TIMED_OUT=true
    [[ $ORNIGAMI_DEADLINE_PHASE == runtime ]] && ORNIGAMI_DEADLINE_TIMED_OUT=true
    return 124
  fi
  cap=$ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS
  (( remaining - 2 < cap )) && cap=$((remaining - 2))
  duration=$cap
  if timeout --signal=TERM --kill-after=2s "${duration}s" "$@"; then
    return 0
  else
    status=$?
  fi
  if (( status == 124 || status == 137 )); then
    ORNIGAMI_COMMAND_TIMED_OUT=true
    [[ $ORNIGAMI_DEADLINE_PHASE == runtime ]] && ORNIGAMI_DEADLINE_TIMED_OUT=true
  fi
  return "$status"
}
