#!/usr/bin/env bash
# Local qualification self-test stub engine. It models only the resource
# lifecycle used by QUALIFY_SELF_TEST=1; it never builds or runs a container.
set -euo pipefail

STATE="${STUB_STATE:?STUB_STATE is required}"
mkdir -p "$STATE/networks" "$STATE/volumes" "$STATE/containers" "$STATE/images"
printf '%s\n' "$*" >> "$STATE/calls.log"

last_arg() {
  local last=""
  for arg in "$@"; do last="$arg"; done
  printf '%s' "$last"
}
find_label() {
  local label="" prev=""
  for arg in "$@"; do
    if [[ "$prev" == "--label" ]]; then label="${arg#*=}"; fi
    prev="$arg"
  done
  printf '%s' "$label"
}
find_name() {
  local name="" prev=""
  for arg in "$@"; do
    if [[ "$prev" == "--name" ]]; then name="$arg"; fi
    prev="$arg"
  done
  printf '%s' "$name"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  info) exit 0 ;;
  logs) exit 0 ;;
  stop) exit 0 ;;
  image)
    sub="${1:-}"
    shift || true
    if [[ "$sub" == "inspect" ]]; then
      if [[ -n "${STUB_EXISTING_IMAGE_ID:-}" ]]; then
        fmt=""
        args=("$@")
        for ((i = 0; i < ${#args[@]}; i++)); do
          if [[ "${args[$i]}" == "--format" ]]; then fmt="${args[$((i + 1))]}"; fi
        done
        name="$(last_arg "$@")"
        if [[ -z "$fmt" ]]; then
          cat <<JSON
[{"Id":"$STUB_EXISTING_IMAGE_ID","Os":"${STUB_EXISTING_PLATFORM%%/*}","Architecture":"${STUB_EXISTING_PLATFORM#*/}","Config":{"User":"${STUB_EXISTING_USER:-1000:1000}","Healthcheck":{"Test":["CMD","/nodejs/bin/node","-e","fetch('http://127.0.0.1:3000/')"]},"Labels":{"org.opencontainers.image.revision":"$STUB_EXISTING_SOURCE_SHA","org.ornigami.public-origin":"$STUB_EXISTING_ORIGIN","org.ornigami.single-replica":"true","org.ornigami.operator-cli":"/app/scripts/builder-invite-operator.mjs","org.ornigami.qualify.run":"${STUB_EXISTING_RUN_LABEL:-stub-build}"}}}]
JSON
          exit 0
        fi
        case "$fmt" in
          *'{{.Id}}'*) printf '%s' "$STUB_EXISTING_IMAGE_ID" ;;
          *'org.opencontainers.image.revision'*) printf '%s' "$STUB_EXISTING_SOURCE_SHA" ;;
          *'org.ornigami.public-origin'*) printf '%s' "$STUB_EXISTING_ORIGIN" ;;
          *'{{.Os}}/{{.Architecture}}'*) printf '%s' "${STUB_EXISTING_PLATFORM:-linux/amd64}" ;;
          *'org.ornigami.single-replica'*) printf 'true' ;;
          *'org.ornigami.operator-cli'*) printf '/app/scripts/builder-invite-operator.mjs' ;;
          *'org.ornigami.qualify.run'*) printf '%s' "${STUB_EXISTING_RUN_LABEL:-stub-build}" ;;
          *'{{json .Config.Healthcheck}}'*) printf '%s' '{"Test":["CMD","/nodejs/bin/node","-e","fetch(http://127.0.0.1:3000/)"]}' ;;
          *'{{.Config.User}}'*) printf '%s' "${STUB_EXISTING_USER:-1000:1000}" ;;
          *) printf 'true' ;;
        esac
        exit 0
      fi
      name="$(last_arg "$@")"
      [[ -d "$STATE/images/$name" ]] || exit 1
      exit 0
    fi
    ;;
  network)
    sub="${1:-}"
    shift || true
    case "$sub" in
      inspect)
        name="$(last_arg "$@")"
        [[ -d "$STATE/networks/$name" ]] || exit 1
        if [[ "$*" == *"org.ornigami.qualify.run"* ]]; then
          cat "$STATE/networks/$name/label"
        else
          printf '{}'
        fi
        ;;
      create)
        name="$(last_arg "$@")"
        [[ ! -e "$STATE/networks/$name" ]] || exit 1
        mkdir -p "$STATE/networks/$name"
        find_label "$@" > "$STATE/networks/$name/label"
        printf '%s\n' "$name"
        ;;
      rm)
        name="$(last_arg "$@")"
        rm -rf "$STATE/networks/$name"
        ;;
      *) echo "stub engine: unsupported network command: $sub" >&2; exit 1 ;;
    esac
    exit 0 ;;
  volume)
    sub="${1:-}"
    shift || true
    case "$sub" in
      inspect)
        name="$(last_arg "$@")"
        [[ -d "$STATE/volumes/$name" ]] || exit 1
        if [[ "$*" == *"org.ornigami.qualify.run"* ]]; then
          cat "$STATE/volumes/$name/label"
        else
          printf '{}'
        fi
        ;;
      create)
        name="$(last_arg "$@")"
        [[ ! -e "$STATE/volumes/$name" ]] || exit 1
        mkdir -p "$STATE/volumes/$name"
        find_label "$@" > "$STATE/volumes/$name/label"
        printf '%s\n' "$name"
        ;;
      rm)
        name="$(last_arg "$@")"
        rm -rf "$STATE/volumes/$name"
        ;;
      *) echo "stub engine: unsupported volume command: $sub" >&2; exit 1 ;;
    esac
    exit 0 ;;
  container)
    sub="${1:-}"
    shift || true
    case "$sub" in
      inspect)
        name="$(last_arg "$@")"
        [[ -d "$STATE/containers/$name" ]] || exit 1
        exit 0
        ;;
      *) echo "stub engine: unsupported container command: $sub" >&2; exit 1 ;;
    esac
    ;;
  run)
    [[ "$*" == *"--network none"* && "$*" == *"--read-only"* && "$*" == *"--user 0:0"* ]] \
      || { echo "stub engine: setup run is not narrowly scoped" >&2; exit 1; }
    volume=""
    prev=""
    for arg in "$@"; do
      if [[ "$prev" == "--mount" ]]; then
        case "$arg" in
          type=volume,src=*,dst=/data/builder)
            volume="${arg#type=volume,src=}"
            volume="${volume%%,dst=/data/builder}"
            ;;
        esac
      fi
      prev="$arg"
    done
    [[ -n "$volume" && -d "$STATE/volumes/$volume" ]] \
      || { echo "stub engine: setup run missing run-owned volume" >&2; exit 1; }
    if [[ "${STUB_FAIL_SETUP:-0}" == "1" ]]; then
      echo "stub engine: deliberate setup failure" >&2
      exit 1
    fi
    printf 'initialized\n' > "$STATE/volumes/$volume/initialized"
    exit 0 ;;
  create)
    if [[ "${STUB_FAIL_CREATE:-0}" == "1" ]]; then
      echo "stub engine: deliberate create failure" >&2
      exit 1
    fi
    name="$(find_name "$@")"
    mkdir -p "$STATE/containers/$name"
    find_label "$@" > "$STATE/containers/$name/label"
    exit 0 ;;
  inspect)
    fmt="${2:-}"
    name="${3:-}"
    [[ -d "$STATE/containers/$name" ]] || exit 1
    if [[ "$fmt" == *"org.ornigami.qualify.run"* ]]; then
      cat "$STATE/containers/$name/label"
    elif [[ "$fmt" == *".State.Health"* ]]; then
      printf 'healthy'
    elif [[ "$fmt" == *"ReadonlyRootfs"* ]]; then
      printf 'true'
    else
      printf 'true'
    fi
    ;;
  rm)
    name="$(last_arg "$@")"
    rm -rf "$STATE/containers/$name"
    exit 0 ;;
  build)
    tag=""
    prev=""
    for arg in "$@"; do
      if [[ "$prev" == "-t" ]]; then tag="$arg"; fi
      prev="$arg"
    done
    [[ -n "$tag" ]] || { echo "stub engine: build without -t" >&2; exit 1; }
    mkdir -p "$STATE/images/$tag"
    printf 'built\n' > "$STATE/images/$tag/built"
    exit 0 ;;
  *) echo "stub engine: unsupported command: $cmd $*" >&2; exit 1 ;;
esac
