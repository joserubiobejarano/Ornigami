# Vercel Ignored Build Step recipe. Paste this exact inline command into the
# project's Custom setting after separate activation approval; do not configure
# the Dashboard to invoke this file. Vercel: 1 continues, 0 cancels.
if [ "${VERCEL_ENV-}" = "preview" ] && [ "${VERCEL_GIT_COMMIT_REF-}" = "codex/ornigami-staging-readiness-20261018" ]; then exit 1; else exit 0; fi
