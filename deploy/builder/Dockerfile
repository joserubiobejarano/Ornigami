# syntax=docker/dockerfile:1.7
#
# Builder-only Ornigami runtime image.
#
# Build from the repository root, not from deploy/builder:
#   docker build -f deploy/builder/Dockerfile \
#     --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 \
#     --build-arg ORNIGAMI_SOURCE_SHA="$(git rev-parse HEAD)" \
#     -t ornigami-builder:local .
#
# Final qualification MUST build the merged candidate with a clean checkout and
# the exact merged SHA. This file packages builder-runtime only; it is not the
# legacy reputation application and must not be used to serve the root app.
#
# Runtime contract:
# - non-root UID/GID 1000;
# - persistent builder-only store at /data/builder;
# - builder-specific health check on / (closed notice is healthy);
# - no reputation auth, database, billing, mail, cron or provider configuration;
# - one replica only (the file-backed ledger is not shareable).
#
# The local qualification image uses the same pinned Node 22.23.3/Debian 13
# distroless parents and vendored npm as the repository's admitted root image.
# The admitted production build path may additionally require the reviewed
# local OCI frontend/toolchain; the final candidate must use that approved path.

FROM --platform=linux/amd64 gcr.io/distroless/nodejs22-debian13:debug-nonroot@sha256:b4b14a0dec7ab24661758de61f452cc1bed82619b8cf744000f2aae05c22aeb5 AS build-base
USER 0:0
SHELL ["/busybox/sh", "-ec"]
ENV PATH=/nodejs/bin:/busybox:/usr/local/bin:/usr/bin:/bin \
    HOME=/home/node \
    npm_config_script_shell=/busybox/sh \
    NEXT_TELEMETRY_DISABLED=1
COPY vendor/build-tools/npm-11.21.1.tgz /tmp/ornigami-npm.tgz
RUN node -e 'const fs=require("node:fs"),crypto=require("node:crypto");if(process.version!=="v22.23.3"||process.versions.openssl!=="3.5.8")throw Error("Unreviewed Node/OpenSSL version");if(crypto.createHash("sha256").update(fs.readFileSync("/tmp/ornigami-npm.tgz")).digest("hex")!=="dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b")throw Error("npm checksum mismatch")' \
    && mkdir -p /opt/ornigami-npm /app /app/qualify /home/node /data/builder /usr/bin /bin /usr/local/bin \
    && tar -xzf /tmp/ornigami-npm.tgz --strip-components=1 -C /opt/ornigami-npm \
    && rm /tmp/ornigami-npm.tgz \
    && ln -s /busybox/env /usr/bin/env \
    && ln -s /busybox/sh /bin/sh \
    && ln -s /opt/ornigami-npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /opt/ornigami-npm/bin/npx-cli.js /usr/local/bin/npx \
    && node -e 'const fs=require("node:fs");for(const p of ["/etc/passwd","/etc/group"])if(fs.readFileSync(p,"utf8").split("\n").some(l=>l&&l.split(":")[2]==="1000"))throw Error("UID/GID 1000 already assigned")' \
    && printf 'node:x:1000:1000:Ornigami Builder:/home/node:/sbin/nologin\n' >> /etc/passwd \
    && printf 'node:x:1000:\n' >> /etc/group \
    && touch /data/builder/.ornigami-volume \
    && chown 1000:1000 /app /app/qualify /home/node /data/builder /data/builder/.ornigami-volume \
    && test "$(npm --version)" = 11.21.1
WORKDIR /app
USER 1000:1000

FROM build-base AS deps
COPY --chown=1000:1000 package.json package-lock.json ./
COPY --chown=1000:1000 scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
COPY --chown=1000:1000 vendor/framework ./vendor/framework
# Pin the target platform explicitly; never delete foreign packages after install.
RUN npm ci --os=linux --cpu=x64 --libc=glibc

FROM deps AS builder
COPY --chown=1000:1000 . .
ARG NEXT_PUBLIC_APP_URL
ARG ORNIGAMI_SOURCE_SHA
ARG ORNIGAMI_BUILD_HEAP_MIB=4096
LABEL org.opencontainers.image.revision=${ORNIGAMI_SOURCE_SHA} \
      org.ornigami.runtime=builder \
      org.ornigami.single-replica=true
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    ORNIGAMI_CONTAINER_BUILD=true \
    ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=true \
    ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false \
    ORNIGAMI_BUILD_WEBPACK_WORKER=false \
    NODE_OPTIONS=--max-old-space-size=${ORNIGAMI_BUILD_HEAP_MIB}
RUN node -e 'const sha=process.env.ORNIGAMI_SOURCE_SHA??"";const url=process.env.NEXT_PUBLIC_APP_URL??"";if(!/^[0-9a-f]{40}$/.test(sha))throw Error("ORNIGAMI_SOURCE_SHA must be the exact 40-hex merged candidate SHA");let parsed;try{parsed=new URL(url)}catch{throw Error("NEXT_PUBLIC_APP_URL must be an absolute URL")};if(parsed.protocol!=="http:"&&parsed.protocol!=="https:")throw Error("NEXT_PUBLIC_APP_URL must be http(s)");if(process.env.BUILDER_RUNTIME_MODE&&process.env.BUILDER_RUNTIME_MODE!=="closed")throw Error("Do not bake invite mode into the image")' \
    && npm run builder:build \
    && mkdir -p builder-runtime/.next/cache \
    && node -e 'const s=require("node:fs").statSync("builder-runtime/.next/cache");if(s.uid!==1000||s.gid!==1000)throw Error("Builder cache ownership drift")' \
    && node --experimental-strip-types scripts/builder-invite-operator.mjs lock-status --store /home/node/operator-check --json >/dev/null \
    && rm -rf /home/node/operator-check

FROM build-base AS prod-deps
COPY --chown=1000:1000 package.json package-lock.json ./
COPY --chown=1000:1000 scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
COPY --chown=1000:1000 vendor/framework ./vendor/framework
RUN npm ci --omit=dev --os=linux --cpu=x64 --libc=glibc

FROM --platform=linux/amd64 gcr.io/distroless/nodejs22-debian13:nonroot@sha256:7b0a2b9262b3d1d57e139e08fe11bccb0a7d426ca515eab0cd6abcaf2016ae5c AS runner
WORKDIR /app
ARG NEXT_PUBLIC_APP_URL
ARG ORNIGAMI_SOURCE_SHA
LABEL org.opencontainers.image.revision=${ORNIGAMI_SOURCE_SHA} \
      org.ornigami.runtime=builder \
      org.ornigami.single-replica=true \
      org.ornigami.store-volume=/data/builder \
      org.ornigami.operator-cli=/app/scripts/builder-invite-operator.mjs \
      org.ornigami.public-origin=${NEXT_PUBLIC_APP_URL}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    HOME=/home/node \
    PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=512 \
    BUILDER_RUNTIME_STORE_DIR=/data/builder

# Reuse the build-stage passwd/group so the runtime user is UID/GID 1000 rather
# than the distroless nonroot default. The store directory is image-owned so a
# fresh named volume inherits the correct ownership on first mount.
COPY --from=build-base --chown=0:0 /etc/passwd /etc/passwd
COPY --from=build-base --chown=0:0 /etc/group /etc/group
COPY --from=build-base --chown=1000:1000 /home/node /home/node
COPY --from=build-base --chown=1000:1000 /data/builder /data/builder
COPY --from=build-base --chown=1000:1000 /app/qualify /app/qualify
COPY --from=prod-deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=builder --chown=1000:1000 /app/builder-runtime/.next ./builder-runtime/.next
COPY --from=builder --chown=1000:1000 /app/builder-runtime/public ./builder-runtime/public
COPY --from=builder --chown=1000:1000 /app/builder-runtime/package.json ./builder-runtime/package.json
COPY --from=builder --chown=1000:1000 /app/builder-runtime/next.config.ts ./builder-runtime/next.config.ts
COPY --from=builder --chown=1000:1000 /app/builder-runtime/tsconfig.json ./builder-runtime/tsconfig.json
COPY --from=builder --chown=1000:1000 /app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /app/tsconfig.json ./tsconfig.json

# Supported offline operator CLI path. The image already carries Node 22; these
# three files are the complete dependency closure of the invite/usage operator
# (Node built-ins only). Run it with `--network none`, the same UID and the same
# store volume as the runtime. No application secret is included.
COPY --from=builder --chown=1000:1000 /app/scripts/builder-invite-operator.mjs ./scripts/builder-invite-operator.mjs
COPY --from=builder --chown=1000:1000 /app/builder-runtime/lib/identity-store.ts ./builder-runtime/lib/identity-store.ts
COPY --from=builder --chown=1000:1000 /app/builder-runtime/lib/usage-ledger.ts ./builder-runtime/lib/usage-ledger.ts

VOLUME ["/data/builder"]
EXPOSE 3000
USER 1000:1000
STOPSIGNAL SIGTERM

# The builder home is 200 in closed mode and in invite mode without a session
# (the sign-in page). Use / rather than the legacy /robots.txt health check.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/',{redirect:'manual',signal:AbortSignal.timeout(1500)}).then(async r=>{await r.body?.cancel();process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/nodejs/bin/node"]
CMD ["node_modules/next/dist/bin/next", "start", "builder-runtime", "--hostname", "0.0.0.0", "--port", "3000"]
