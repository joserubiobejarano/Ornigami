#!/usr/bin/env bash
# Shared evidence-preparation helpers for retained-image qualification.
#
# These functions perform the real filesystem work used by the wrapper. They are
# sourced by the wrapper and exercised directly by tests with fresh fixture
# directories and controlled command stubs. Every destination directory is
# created and verified before the first write.

retained_fail() {
  echo "FAIL: $*" >&2
  return 1
}

retained_require_dir() {
  local directory="$1" label="${2:-directory}"
  if [[ -e "$directory" && ! -d "$directory" ]]; then
    retained_fail "$label is not a directory: $directory"
    return 1
  fi
  mkdir -p "$directory" || {
    retained_fail "could not create $label: $directory"
    return 1
  }
  [[ -d "$directory" && -w "$directory" ]] || {
    retained_fail "$label is not writable: $directory"
    return 1
  }
}

retained_copy_file() {
  local source="$1" destination="$2" label="${3:-file}"
  [[ -f "$source" ]] || return 0
  retained_require_dir "$(dirname "$destination")" "$label destination" || return 1
  cp "$source" "$destination" || {
    retained_fail "could not copy $label: $source -> $destination"
    return 1
  }
}

prepare_retained_evidence_root() {
  local root="$1"
  [[ -n "$root" ]] || {
    retained_fail "evidence root is required"
    return 1
  }
  retained_require_dir "$root" "evidence root" || return 1
  retained_require_dir "$root/logs" "evidence logs" || return 1
  retained_require_dir "$root/custody" "evidence custody" || return 1
  retained_require_dir "$root/edge" "evidence edge" || return 1
  retained_require_dir "$root/secrets" "evidence secrets" || return 1
  chmod 700 "$root/secrets" 2>/dev/null || true
}

export_retained_evidence() {
  local root="$1" stage="$2" file
  [[ -n "$root" && -d "$root" ]] || {
    retained_fail "evidence root is missing: $root"
    return 1
  }
  if [[ -e "$stage" && ! -d "$stage" ]]; then
    retained_fail "export staging is not a directory: $stage"
    return 1
  fi
  retained_require_dir "$stage" "export staging" || return 1
  retained_require_dir "$stage/logs" "export logs" || return 1
  retained_require_dir "$stage/custody" "export custody" || return 1
  retained_require_dir "$stage/edge" "export edge" || return 1

  if [[ -d "$root/logs" ]]; then
    cp -R "$root/logs/." "$stage/logs/" || {
      retained_fail "could not copy evidence logs"
      return 1
    }
  fi
  if [[ -d "$root/custody" ]]; then
    cp -R "$root/custody/." "$stage/custody/" || {
      retained_fail "could not copy evidence custody"
      return 1
    }
  fi
  if [[ -d "$root/edge" ]]; then
    cp -R "$root/edge/." "$stage/edge/" || {
      retained_fail "could not copy evidence edge"
      return 1
    }
  fi

  for file in \
    image-inspect.json \
    image-identity-verification.json \
    archive-producer-identity.txt \
    host.txt \
    cleanup-receipt.txt \
    access-closed.txt; do
    retained_copy_file "$root/$file" "$stage/$file" "$file" || return 1
  done

  if [[ -n "${ARCHIVE_PATH:-}" && -f "${ARCHIVE_PATH:-}" ]]; then
    local archive_name
    archive_name="$(basename "$ARCHIVE_PATH")"
    if [[ ! -f "$stage/custody/$archive_name" ]]; then
      retained_require_dir "$stage/custody" "export custody" || return 1
      cp "$ARCHIVE_PATH" "$stage/custody/$archive_name" || {
        retained_fail "could not copy retained archive into custody staging"
        return 1
      }
    fi
  fi
  if [[ -n "${ARCHIVE_RECEIPT_PATH:-}" && -f "${ARCHIVE_RECEIPT_PATH:-}" ]]; then
    retained_copy_file "$ARCHIVE_RECEIPT_PATH" "$stage/custody/archive-receipt.json" "archive receipt" || return 1
  fi

  if [[ -n "${REHEARSAL_DIR:-}" && -d "$REHEARSAL_DIR/existing-image-qualification" ]]; then
    retained_require_dir "$stage" "qualified evidence staging" || return 1
    cp -R "$REHEARSAL_DIR/existing-image-qualification" "$stage/" || {
      retained_fail "could not copy existing-image qualification evidence"
      return 1
    }
  fi

  find "$stage" -mindepth 1 -type d -exec chmod 0750 {} + || return 1
  find "$stage" -type f -exec chmod 0640 {} + || return 1
}

record_retained_host_identity() {
  local root="$1" source="$2" producer="$3" consumer="$4" workflow="$5"
  local origin="$6" image="$7" archive_sha="$8" archive_bytes="$9"
  local docker_bin="${DOCKER_BIN:-docker}"
  local daemon_id docker_client runner node_version temporary
  [[ -n "$root" ]] || {
    retained_fail "evidence root is required"
    return 1
  }
  retained_require_dir "$root" "evidence root" || return 1
  daemon_id="$("$docker_bin" info --format '{{.ID}}')" || {
    retained_fail "could not read the Docker daemon identity"
    return 1
  }
  docker_client="$("$docker_bin" --version)" || {
    retained_fail "could not read the Docker client version"
    return 1
  }
  runner="$(uname -srm)" || {
    retained_fail "could not read the runner identity"
    return 1
  }
  node_version="$(node --version)" || {
    retained_fail "could not read the Node version"
    return 1
  }
  temporary="$(mktemp "$root/.host.txt.XXXXXX")" || {
    retained_fail "could not create the host identity temporary file"
    return 1
  }
  {
    printf 'source_sha=%s\n' "$source"
    printf 'producer_harness_sha=%s\n' "$producer"
    printf 'consumer_harness_sha=%s\n' "$consumer"
    printf 'workflow_sha=%s\n' "$workflow"
    printf 'origin=%s\n' "$origin"
    printf 'image_id=%s\n' "$image"
    printf 'archive_sha256=%s\n' "$archive_sha"
    printf 'archive_bytes=%s\n' "$archive_bytes"
    printf 'host_daemon_id=%s\n' "$daemon_id"
    printf 'docker_client=%s\n' "$docker_client"
    printf 'runner=%s\n' "$runner"
    printf 'node=%s\n' "$node_version"
  } > "$temporary" || {
    rm -f "$temporary"
    retained_fail "could not write the host identity temporary file"
    return 1
  }
  mv "$temporary" "$root/host.txt" || {
    rm -f "$temporary"
    retained_fail "could not stage host.txt"
    return 1
  }
}
