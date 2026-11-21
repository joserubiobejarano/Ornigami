#!/usr/bin/env bash
# Stub engine for exact-candidate rehearsal routing/checkpoint/resume tests.
# It models per-daemon image state and enough Docker/Podman CLI surface to run
# build-and-retain, archive verification, phase transfer and edge inspection.
set -euo pipefail

BASE_STATE="${STUB_STATE:?STUB_STATE is required}"
if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  DAEMON_KEY="$DOCKER_CONTEXT"
elif [[ -n "${DOCKER_HOST:-}" ]]; then
  DAEMON_KEY="$DOCKER_HOST"
elif [[ -n "${CONTAINER_HOST:-}" ]]; then
  DAEMON_KEY="$CONTAINER_HOST"
else
  DAEMON_KEY="default"
fi
SAFE_KEY="${DAEMON_KEY//[^A-Za-z0-9_.-]/_}"
if [[ "$DAEMON_KEY" == "default" ]]; then
  STATE="$BASE_STATE"
else
  STATE="$BASE_STATE/$SAFE_KEY"
fi
mkdir -p "$STATE/images" "$STATE/containers" "$STATE/volumes" "$STATE/networks"
if [[ -n "${STUB_CALL_LOG:-}" ]]; then
  mkdir -p "$(dirname "$STUB_CALL_LOG")"
  printf 'daemon=%s context=%s host=%s args=%s\n' "$DAEMON_KEY" "${DOCKER_CONTEXT:-}" "${DOCKER_HOST:-${CONTAINER_HOST:-}}" "$*" >> "$STUB_CALL_LOG"
fi

daemon_id() {
  if [[ -n "${STUB_DAEMON_MAP:-}" && -f "$STUB_DAEMON_MAP" ]]; then
    local mapped
    mapped="$(awk -F= -v key="$DAEMON_KEY" '$1 == key {print $2; exit}' "$STUB_DAEMON_MAP")"
    if [[ -n "$mapped" ]]; then printf '%s' "$mapped"; return; fi
  fi
  printf '%s' "${STUB_DAEMON_ID:-daemon-$SAFE_KEY}"
}

last_arg() {
  local last=""
  for arg in "$@"; do last="$arg"; done
  printf '%s' "$last"
}
find_name() {
  local name="" prev=""
  for arg in "$@"; do
    if [[ "$prev" == "--name" ]]; then name="$arg"; fi
    prev="$arg"
  done
  printf '%s' "$name"
}
find_after() {
  local flag="$1"; shift || true
  local prev=""
  for arg in "$@"; do
    if [[ "$prev" == "$flag" ]]; then printf '%s' "$arg"; return; fi
    prev="$arg"
  done
}
find_label() {
  local wanted="$1"; shift || true
  local prev=""
  for arg in "$@"; do
    if [[ "$prev" == "--label" && "$arg" == "$wanted="* ]]; then
      printf '%s' "${arg#*=}"
      return
    fi
    prev="$arg"
  done
}
image_dir() {
  local name="$1"
  if [[ -d "$STATE/images/$name" && -f "$STATE/images/$name/id" ]]; then
    printf '%s' "$STATE/images/$name"
    return 0
  fi
  local candidate
  for candidate in "$STATE"/images/*; do
    if [[ -f "$candidate/id" && "$(cat "$candidate/id")" == "$name" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}
write_image() {
  local dir="$1" id="$2" source="$3" origin="$4" platform="$5" user="$6"
  mkdir -p "$dir"
  printf '%s' "$id" > "$dir/id"
  printf '%s' "$source" > "$dir/source"
  printf '%s' "$origin" > "$dir/origin"
  printf '%s' "$platform" > "$dir/platform"
  printf '%s' "$user" > "$dir/user"
  printf 'stub-run' > "$dir/run-label"
}
image_json() {
  local dir="$1" platform os arch
  platform="$(cat "$dir/platform")"
  os="${platform%%/*}"
  arch="${platform#*/}"
  printf '[{"Id":"%s","Os":"%s","Architecture":"%s","Config":{"User":"%s","Healthcheck":{"Test":["CMD","node","-e","fetch(http://127.0.0.1:3000/)"]},"Labels":{"org.opencontainers.image.revision":"%s","org.ornigami.public-origin":"%s","org.ornigami.single-replica":"true","org.ornigami.operator-cli":"/app/scripts/builder-invite-operator.mjs","org.ornigami.qualify.run":"%s"}}}]' \
    "$(cat "$dir/id")" "$os" "$arch" "$(cat "$dir/user")" "$(cat "$dir/source")" "$(cat "$dir/origin")" "$(cat "$dir/run-label")"
}
build_image() {
  local tag source origin platform id
  tag="$(find_after -t "$@" || true)"
  [[ -n "$tag" ]] || { echo "stub: build without -t" >&2; exit 1; }
  source="$(printf '%s\n' "$@" | sed -n 's/^ORNIGAMI_SOURCE_SHA=//p' | tail -1)"
  origin="$(printf '%s\n' "$@" | sed -n 's/^NEXT_PUBLIC_APP_URL=//p' | tail -1)"
  platform="$(find_after --platform "$@" || true)"
  id="${STUB_BUILT_IMAGE_ID:-sha256:$(printf '%s' "$tag" | sha256sum | awk '{print $1}')}"
  write_image "$STATE/images/$tag" "$id" "${source:-$STUB_BUILT_SOURCE_SHA}" "${origin:-$STUB_BUILT_ORIGIN}" "${platform:-linux/amd64}" "${STUB_BUILT_USER:-1000:1000}"
  write_image "$STATE/images/$id" "$id" "${source:-$STUB_BUILT_SOURCE_SHA}" "${origin:-$STUB_BUILT_ORIGIN}" "${platform:-linux/amd64}" "${STUB_BUILT_USER:-1000:1000}"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  info)
    fmt="$(find_after --format "$@" || true)"
    if [[ "$fmt" == *".ID"* || "$fmt" == *"Host.Hostname"* || "$fmt" == *"GraphRoot"* ]]; then
      daemon_id
    fi
    ;;
  build)
    build_image "$@"
    ;;
  load)
    input="$(find_after -i "$@" || true)"
    [[ -n "$input" && -f "$input" ]] || { echo "stub: image load without -i" >&2; exit 1; }
    id="$(sed -n 's/^id=//p' "$input")"
    source="$(sed -n 's/^source=//p' "$input")"
    origin="$(sed -n 's/^origin=//p' "$input")"
    platform="$(sed -n 's/^platform=//p' "$input")"
    user="$(sed -n 's/^user=//p' "$input")"
    write_image "$STATE/images/$id" "$id" "$source" "$origin" "$platform" "$user"
    printf 'Loaded image ID: %s\n' "$id"
    ;;
  image)
    sub="${1:-}"; shift || true
    case "$sub" in
      build)
        build_image "$@"
        ;;
      inspect)
        fmt="$(find_after --format "$@" || true)"
        name="$(last_arg "$@")"
        dir="$(image_dir "$name")" || exit 1
        if [[ -z "$fmt" ]]; then
          image_json "$dir"
        else
          case "$fmt" in
            *'{{.Id}}'*) cat "$dir/id" ;;
            *'org.opencontainers.image.revision'*) cat "$dir/source" ;;
            *'org.ornigami.public-origin'*) cat "$dir/origin" ;;
            *'{{.Os}}/{{.Architecture}}'*) cat "$dir/platform" ;;
            *'org.ornigami.single-replica'*) printf 'true' ;;
            *'org.ornigami.operator-cli'*) printf '/app/scripts/builder-invite-operator.mjs' ;;
            *'org.ornigami.qualify.run'*) cat "$dir/run-label" ;;
            *'{{json .Config.Healthcheck}}'*) printf '%s' '{"Test":["CMD","node","-e","fetch(http://127.0.0.1:3000/)"]}' ;;
            *'{{.Config.User}}'*) cat "$dir/user" ;;
            *) printf 'true' ;;
          esac
        fi
        ;;
      save)
        out="$(find_after -o "$@" || true)"
        [[ -n "$out" ]] || { echo "stub: image save without -o" >&2; exit 1; }
        name="$(last_arg "$@")"
        dir="$(image_dir "$name")" || exit 1
        {
          printf 'id=%s\n' "$(cat "$dir/id")"
          printf 'source=%s\n' "$(cat "$dir/source")"
          printf 'origin=%s\n' "$(cat "$dir/origin")"
          printf 'platform=%s\n' "$(cat "$dir/platform")"
          printf 'user=%s\n' "$(cat "$dir/user")"
        } > "$out"
        ;;
      load)
        input="$(find_after -i "$@" || true)"
        [[ -n "$input" && -f "$input" ]] || { echo "stub: image load without -i" >&2; exit 1; }
        id="$(sed -n 's/^id=//p' "$input")"
        source="$(sed -n 's/^source=//p' "$input")"
        origin="$(sed -n 's/^origin=//p' "$input")"
        platform="$(sed -n 's/^platform=//p' "$input")"
        user="$(sed -n 's/^user=//p' "$input")"
        write_image "$STATE/images/$id" "$id" "$source" "$origin" "$platform" "$user"
        printf 'Loaded image ID: %s\n' "$id"
        ;;
      rm) name="$(last_arg "$@")"; rm -rf "$STATE/images/$name" ;;
      *) echo "stub: unsupported image command: $sub" >&2; exit 1 ;;
    esac
    ;;
  inspect)
    fmt="${2:-}"
    name="${3:-}"
    [[ -d "$STATE/containers/$name" ]] || exit 1
    if [[ "$fmt" == *"org.opencontainers.image.revision"* ]]; then
      cat "$STATE/containers/$name/source" 2>/dev/null || printf '%s' "${STUB_EDGE_SOURCE_SHA:-}"
    elif [[ "$fmt" == *"org.ornigami.public-origin"* ]]; then
      cat "$STATE/containers/$name/origin" 2>/dev/null || printf '%s' "${STUB_EDGE_ORIGIN:-}"
    elif [[ "$fmt" == *".State.Running"* ]]; then
      cat "$STATE/containers/$name/running" 2>/dev/null || printf 'true'
    elif [[ "$fmt" == *".State.Health"* ]]; then
      cat "$STATE/containers/$name/health" 2>/dev/null || printf 'healthy'
    elif [[ "$fmt" == *"ReadonlyRootfs"* ]]; then
      printf 'true'
    elif [[ "$fmt" == *".Config.User"* ]]; then
      printf '1000:1000'
    elif [[ "$fmt" == *".Image"* ]]; then
      cat "$STATE/containers/$name/image"
    elif [[ "$fmt" == *"org.ornigami.qualify.run"* ]]; then
      cat "$STATE/containers/$name/label" 2>/dev/null || printf 'edge'
    else
      printf 'true'
    fi
    ;;
  volume)
    sub="${1:-}"; shift || true
    case "$sub" in
      inspect)
        name="$(last_arg "$@")"
        [[ -d "$STATE/volumes/$name" ]] || exit 1
        if [[ "$*" == *"org.ornigami.qualify.run"* ]]; then cat "$STATE/volumes/$name/label"; else printf '{}'; fi
        ;;
      create)
        name="$(last_arg "$@")"; mkdir -p "$STATE/volumes/$name"
        find_label org.ornigami.qualify.run "$@" > "$STATE/volumes/$name/label"
        ;;
      rm) name="$(last_arg "$@")"; rm -rf "$STATE/volumes/$name" ;;
      *) echo "stub: unsupported volume command: $sub" >&2; exit 1 ;;
    esac
    ;;
  network)
    sub="${1:-}"; shift || true
    case "$sub" in
      create) name="$(last_arg "$@")"; mkdir -p "$STATE/networks/$name" ;;
      inspect) name="$(last_arg "$@")"; [[ -d "$STATE/networks/$name" ]] || exit 1; printf '{}' ;;
      rm) name="$(last_arg "$@")"; rm -rf "$STATE/networks/$name" ;;
      *) echo "stub: unsupported network command: $sub" >&2; exit 1 ;;
    esac
    ;;
  pull) exit 0 ;;
  logs) exit 0 ;;
  stop) exit 0 ;;
  *) echo "stub: unsupported command: $cmd $*" >&2; exit 1 ;;
esac
