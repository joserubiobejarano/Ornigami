#!/usr/bin/env bash
# Minimal container-engine double for local rehearsal routing checks.
# It never builds or loads a real image. It supports only the calls made by
# build-and-retain.sh and verify-image-archive.mjs.
set -euo pipefail

STATE="${STUB_STATE:?STUB_STATE is required}"
IMAGE_ID="${STUB_IMAGE_ID:?STUB_IMAGE_ID is required}"
SOURCE_SHA="${STUB_SOURCE_SHA:?STUB_SOURCE_SHA is required}"
ORIGIN="${STUB_ORIGIN:?STUB_ORIGIN is required}"
mkdir -p "$STATE"

last_arg() {
  local last=""
  for arg in "$@"; do last="$arg"; done
  printf '%s' "$last"
}

case "${1:-}" in
  info)
    exit 0
    ;;
  build)
    printf '%s\n' "$*" >> "$STATE/calls.log"
    exit 0
    ;;
  load)
    printf 'load %s\n' "$*" >> "$STATE/calls.log"
    mkdir -p "$STATE/loaded"
    exit 0
    ;;
  image)
    sub="${2:-}"
    shift 2 || true
    case "$sub" in
      save)
        archive=""
        image=""
        prev=""
        for arg in "$@"; do
          if [[ "$prev" == "-o" ]]; then archive="$arg"; fi
          prev="$arg"
        done
        image="$(last_arg "$@")"
        [[ -n "$archive" && -n "$image" ]] || exit 1
        mkdir -p "$(dirname "$archive")"
        printf 'stub archive for %s from %s\n' "$image" "$SOURCE_SHA" > "$archive"
        printf 'save %s %s\n' "$image" "$archive" >> "$STATE/calls.log"
        exit 0
        ;;
      load)
        printf 'load %s\n' "$*" >> "$STATE/calls.log"
        mkdir -p "$STATE/loaded"
        exit 0
        ;;
      inspect)
        format=""
        target=""
        prev=""
        for arg in "$@"; do
          if [[ "$prev" == "--format" ]]; then format="$arg"; fi
          target="$arg"
          prev="$arg"
        done
        [[ "$target" == "$format" ]] && target=""
        if [[ "$target" == sha256:* ]]; then
          if [[ ! -d "$STATE/loaded" ]]; then exit 1; fi
          if [[ "$target" != "$IMAGE_ID" ]]; then exit 1; fi
        fi
        case "$format" in
          '') cat <<JSON
[{"Id":"$IMAGE_ID","Os":"linux","Architecture":"amd64","Config":{"User":"1000:1000","Labels":{"org.opencontainers.image.revision":"$SOURCE_SHA","org.ornigami.public-origin":"$ORIGIN","org.ornigami.single-replica":"true","org.ornigami.operator-cli":"/app/scripts/builder-invite-operator.mjs","org.ornigami.qualify.run":"stub-rehearsal"}}}]
JSON
            ;;
          *'{{.Id}}'*) printf '%s' "$IMAGE_ID" ;;
          *'org.opencontainers.image.revision'*) printf '%s' "$SOURCE_SHA" ;;
          *'org.ornigami.public-origin'*) printf '%s' "$ORIGIN" ;;
          *'{{.Os}}/{{.Architecture}}'*) printf 'linux/amd64' ;;
          *'org.ornigami.single-replica'*) printf 'true' ;;
          *'org.ornigami.operator-cli'*) printf '/app/scripts/builder-invite-operator.mjs' ;;
          *'org.ornigami.qualify.run'*) printf 'stub-rehearsal' ;;
          *'{{.Config.User}}'*) printf '1000:1000' ;;
          *'{{json .Config.Healthcheck}}'*) printf '%s' '{"Test":["CMD","/nodejs/bin/node","-e","fetch(http://127.0.0.1:3000/)"]}' ;;
          *) printf 'true' ;;
        esac
        exit 0
        ;;
      *)
        echo "stub rehearsal engine: unsupported image command: $sub" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "stub rehearsal engine: unsupported command: ${1:-}" >&2
    exit 1
    ;;
esac
