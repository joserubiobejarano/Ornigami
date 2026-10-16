# syntax=docker/dockerfile:1.7
FROM --platform=linux/amd64 node:22.23.3-trixie-slim@sha256:6b25e0bf3aaee33c18ba3c5d1b71646df1ba485a2a5500fd8376a3be3d110812 AS deps
WORKDIR /app
RUN mkdir -p /app && chown node:node /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
COPY --chown=node:node vendor/framework ./vendor/framework
USER node
RUN npm ci

FROM deps AS builder
COPY --chown=node:node . .
ARG NEXT_PUBLIC_APP_URL
ARG ORNIGAMI_SOURCE_SHA
ARG ORNIGAMI_BUILD_HEAP_MIB=1408
ARG ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=false
ARG ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false
ARG ORNIGAMI_BUILD_WEBPACK_WORKER=false
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    ORNIGAMI_CONTAINER_BUILD=true \
    ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=${ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS} \
    ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=${ORNIGAMI_BUILD_DISABLE_SOURCEMAPS} \
    ORNIGAMI_BUILD_WEBPACK_WORKER=${ORNIGAMI_BUILD_WEBPACK_WORKER} \
    NODE_OPTIONS=--max-old-space-size=${ORNIGAMI_BUILD_HEAP_MIB} \
    AUTH_SECRET=rehearsal-only-synthetic-build-secret-not-for-use \
    GOOGLE_CLIENT_ID=rehearsal.invalid \
    GOOGLE_CLIENT_SECRET=rehearsal-only-placeholder-not-a-provider-credential \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN test -n "$NEXT_PUBLIC_APP_URL" && node -e 'if (!/^[0-9a-f]{40}$/.test(process.env.ORNIGAMI_SOURCE_SHA ?? "")) throw new Error("ORNIGAMI_SOURCE_SHA must be a full lowercase commit SHA"); const raw=process.env.ORNIGAMI_BUILD_HEAP_MIB ?? ""; const heap=Number(raw); if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(heap) || heap < 512 || heap > 8192) throw new Error("ORNIGAMI_BUILD_HEAP_MIB must be an integer from 512 through 8192 MiB"); for (const name of ["ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS", "ORNIGAMI_BUILD_DISABLE_SOURCEMAPS", "ORNIGAMI_BUILD_WEBPACK_WORKER"]) if (!/^(true|false)$/.test(process.env[name] ?? "")) throw new Error(`${name} must be true or false`)' && npm run build

FROM --platform=linux/amd64 node:22.23.3-trixie-slim@sha256:6b25e0bf3aaee33c18ba3c5d1b71646df1ba485a2a5500fd8376a3be3d110812 AS prod-deps
WORKDIR /app
RUN mkdir -p /app && chown node:node /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
COPY --chown=node:node vendor/framework ./vendor/framework
USER node
RUN npm ci --omit=dev

FROM --platform=linux/amd64 node:22.23.3-trixie-slim@sha256:6b25e0bf3aaee33c18ba3c5d1b71646df1ba485a2a5500fd8376a3be3d110812 AS runner
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && test "$(node --version)" = "v22.23.3" \
    && for path in /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg; do test ! -e "$path"; done
WORKDIR /app
ARG NEXT_PUBLIC_APP_URL
ARG ORNIGAMI_SOURCE_SHA
LABEL org.opencontainers.image.revision=${ORNIGAMI_SOURCE_SHA} \
      org.ornigami.public-origin=${NEXT_PUBLIC_APP_URL}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=512
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/src/lib/security-headers.ts ./src/lib/security-headers.ts
COPY --from=builder --chown=node:node /app/src/lib/env.ts ./src/lib/env.ts
COPY --from=builder --chown=node:node /app/scripts/coolify-cron-dispatch.mjs ./scripts/coolify-cron-dispatch.mjs
COPY --from=builder --chown=node:node /app/scripts/vps-cron-dispatch.mjs ./scripts/vps-cron-dispatch.mjs
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(1500)}).then(async r=>{await r.body?.cancel();process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
