# syntax=docker/dockerfile:1.7
FROM --platform=linux/amd64 node:22.23.3-bookworm-slim@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562 AS deps
WORKDIR /app
RUN mkdir -p /app && chown node:node /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
USER node
RUN npm ci

FROM deps AS builder
COPY --chown=node:node . .
ARG NEXT_PUBLIC_APP_URL
ARG ORNIGAMI_SOURCE_SHA
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    ORNIGAMI_CONTAINER_BUILD=true \
    NODE_OPTIONS=--max-old-space-size=1408 \
    AUTH_SECRET=rehearsal-only-synthetic-build-secret-not-for-use \
    GOOGLE_CLIENT_ID=rehearsal.invalid \
    GOOGLE_CLIENT_SECRET=rehearsal-only-placeholder-not-a-provider-credential \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN test -n "$NEXT_PUBLIC_APP_URL" && node -e 'if (!/^[0-9a-f]{40}$/.test(process.env.ORNIGAMI_SOURCE_SHA ?? "")) throw new Error("ORNIGAMI_SOURCE_SHA must be a full lowercase commit SHA")' && npm run build

FROM --platform=linux/amd64 node:22.23.3-bookworm-slim@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562 AS prod-deps
WORKDIR /app
RUN mkdir -p /app && chown node:node /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
USER node
RUN npm ci --omit=dev

FROM --platform=linux/amd64 node:22.23.3-bookworm-slim@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562 AS runner
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
