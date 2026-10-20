#!/usr/bin/env bash
# Shared deadline primitives for the disconnected runtime acceptance harness.

ornigami_deadline_init() {
  local now deadline_root
  local work_deadline=${ORNIGAMI_WORK_DEADLINE_EPOCH:-}
  [[ $work_deadline =~ ^[0-9]{1,12}$ ]] || {
    printf 'ORNIGAMI_WORK_DEADLINE_EPOCH must be a Unix epoch in seconds.\n' >&2
    return 2
  }
  command -v timeout >/dev/null || {
    printf 'GNU timeout is required for bounded runtime commands.\n' >&2
    return 2
  }
  if [[ ${ORNIGAMI_RUNTIME_DEADLINE_SUPERVISED:-false} == true ]]; then
    [[ ${ORNIGAMI_RUNTIME_DEADLINE_EPOCH:-} =~ ^[0-9]{1,12}$ &&
       ${ORNIGAMI_CLEANUP_DEADLINE_EPOCH:-} =~ ^[0-9]{1,12}$ &&
       ${ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS:-} =~ ^[0-9]{1,4}$ &&
       ${ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS:-} =~ ^[0-9]{1,4}$ &&
       -n ${ORNIGAMI_DEADLINE_STATE_FILE:-} ]] || {
      printf 'Supervised runtime deadline state is missing or invalid.\n' >&2
      return 2
    }
    now=$(date +%s) || return 2
    (( now < ORNIGAMI_RUNTIME_DEADLINE_EPOCH )) || {
      ORNIGAMI_DEADLINE_TIMED_OUT=true
      ORNIGAMI_COMMAND_TIMED_OUT=true
      printf 'Runtime acceptance deadline is exhausted.\n' >&2
      return 124
    }
    ORNIGAMI_DEADLINE_PHASE=runtime
    : >>"$ORNIGAMI_DEADLINE_STATE_FILE"
    return 0
  fi
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
  ORNIGAMI_DOCKER_TIMED_OUT=false
  ORNIGAMI_SUPERVISOR_TERMINATED=false
  deadline_root=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
  ORNIGAMI_DEADLINE_STATE_FILE=${ORNIGAMI_DEADLINE_STATE_FILE:-$deadline_root/ornigami-runtime-deadline-${BASHPID}.state}
  : >"$ORNIGAMI_DEADLINE_STATE_FILE"
  chmod 600 -- "$ORNIGAMI_DEADLINE_STATE_FILE"
  export ORNIGAMI_RUNTIME_DEADLINE_EPOCH ORNIGAMI_CLEANUP_DEADLINE_EPOCH
  export ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS
  export ORNIGAMI_DEADLINE_STATE_FILE ORNIGAMI_DEADLINE_TIMED_OUT ORNIGAMI_COMMAND_TIMED_OUT ORNIGAMI_DOCKER_TIMED_OUT ORNIGAMI_SUPERVISOR_TERMINATED
}

ornigami_deadline_record() {
  local phase=${1:-runtime} operation=${2:-command} outcome=${3:-command-timeout}
  [[ -n ${ORNIGAMI_DEADLINE_STATE_FILE:-} ]] || return 0
  printf '%s|%s|%s\n' "$phase" "$operation" "$outcome" >>"$ORNIGAMI_DEADLINE_STATE_FILE"
}

ornigami_deadline_sync_state() {
  local phase operation outcome
  [[ -r ${ORNIGAMI_DEADLINE_STATE_FILE:-} ]] || return 0
  while IFS='|' read -r phase operation outcome; do
    [[ -n $outcome ]] || continue
    ORNIGAMI_COMMAND_TIMED_OUT=true
    if [[ $operation == docker ]]; then ORNIGAMI_DOCKER_TIMED_OUT=true; fi
    if [[ $outcome == overall-deadline || $outcome == supervisor-timeout ]]; then
      ORNIGAMI_DEADLINE_TIMED_OUT=true
    fi
    if [[ $outcome == supervisor-terminated || $outcome == supervisor-timeout ]]; then
      ORNIGAMI_SUPERVISOR_TERMINATED=true
    fi
  done <"$ORNIGAMI_DEADLINE_STATE_FILE"
  export ORNIGAMI_DEADLINE_TIMED_OUT ORNIGAMI_COMMAND_TIMED_OUT ORNIGAMI_DOCKER_TIMED_OUT ORNIGAMI_SUPERVISOR_TERMINATED
}

ornigami_deadline_set_cleanup() {
  ORNIGAMI_DEADLINE_PHASE=cleanup
}

ornigami_deadline_check_runtime() {
  local now
  now=$(date +%s) || return 125
  if (( now >= ORNIGAMI_RUNTIME_DEADLINE_EPOCH )); then
    ornigami_deadline_record runtime command overall-deadline
    ornigami_deadline_sync_state
    return 124
  fi
}

ornigami_deadline_supervise() {
  local runtime_seconds=$1 status wrapper
  shift
  (( runtime_seconds > 0 )) || return 124
  wrapper='set +e
state_file=$1; reserve=$2; shift 2
worker_pid=
kill_timer_pid=
on_term() {
  trap "" TERM
  printf "runtime|supervisor|supervisor-terminated\\n" >>"$state_file"
  if [[ -n $worker_pid ]]; then
    kill -TERM -- "-$worker_pid" 2>/dev/null || kill -TERM "$worker_pid" 2>/dev/null || true
    (
      trap "" TERM
      sleep "$((reserve - 1))"
      kill -KILL -- "-$worker_pid" 2>/dev/null || kill -KILL "$worker_pid" 2>/dev/null || true
    ) &
    kill_timer_pid=$!
  fi
}
trap on_term TERM
set -m
"$@" &
worker_pid=$!
while :; do
  wait "$worker_pid"; status=$?
  if ! kill -0 "$worker_pid" 2>/dev/null; then break; fi
done
if [[ -n $kill_timer_pid ]]; then kill "$kill_timer_pid" 2>/dev/null || true; wait "$kill_timer_pid" 2>/dev/null || true; fi
exit "$status"'
  if timeout --signal=TERM --kill-after="${ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS}s" "${runtime_seconds}s" \
    bash -c "$wrapper" deadline-supervisor "$ORNIGAMI_DEADLINE_STATE_FILE" "$ORNIGAMI_RUNTIME_CLEANUP_RESERVE_SECONDS" "$@"; then
    return 0
  else
    status=$?
  fi
  ornigami_deadline_sync_state
  if (( status == 124 )) && [[ $ORNIGAMI_SUPERVISOR_TERMINATED == true ]]; then
    ornigami_deadline_record runtime supervisor supervisor-timeout
    ornigami_deadline_sync_state
  fi
  return "$status"
}

ornigami_deadline_run() {
  local now deadline remaining cap duration status wrapper operation
  deadline=$ORNIGAMI_RUNTIME_DEADLINE_EPOCH
  [[ $ORNIGAMI_DEADLINE_PHASE == cleanup ]] && deadline=$ORNIGAMI_CLEANUP_DEADLINE_EPOCH
  operation=${ORNIGAMI_DEADLINE_OPERATION:-command}
  now=$(date +%s) || return 125
  remaining=$((deadline - now))
  if (( remaining <= 2 )); then
    if [[ $ORNIGAMI_DEADLINE_PHASE == runtime ]]; then
      ornigami_deadline_record runtime "$operation" overall-deadline
    else
      ornigami_deadline_record cleanup "$operation" command-timeout
    fi
    ornigami_deadline_sync_state
    return 124
  fi
  cap=$ORNIGAMI_COMMAND_TIMEOUT_CAP_SECONDS
  (( remaining - 2 < cap )) && cap=$((remaining - 2))
  duration=$cap
  wrapper='set +e
phase=$1; operation=$2; state_file=$3; shift 3
child_pid=
on_term() {
  printf "%s|%s|command-timeout\\n" "$phase" "$operation" >>"$state_file"
  if [[ -n $child_pid ]]; then kill -TERM "$child_pid" 2>/dev/null || true; fi
}
trap on_term TERM
# Background commands otherwise receive /dev/null on stdin; preserve caller input for bounded transports.
"$@" <&0 &
child_pid=$!
while :; do
  wait "$child_pid"; status=$?
  if ! kill -0 "$child_pid" 2>/dev/null; then break; fi
done
exit "$status"'
  if timeout --signal=TERM --kill-after=2s "${duration}s" bash -c "$wrapper" deadline-command \
    "$ORNIGAMI_DEADLINE_PHASE" "$operation" "$ORNIGAMI_DEADLINE_STATE_FILE" "$@"; then
    return 0
  else
    status=$?
  fi
  ornigami_deadline_sync_state
  return "$status"
}
