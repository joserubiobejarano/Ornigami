# syntax=ornigami-frontend
# The admitted controller MUST supply this named context from the hash-bound
# local OCI frontend in deploy/coolify/toolchain/recipe.json. No registry fallback.
# Signed parents: exact official Node 22.23.3 / OpenSSL 3.5.8 binary identity.
# Static ELF closure passed; Linux loading, codecs and security remain unaccepted.
FROM --platform=linux/amd64 gcr.io/distroless/nodejs22-debian13:debug-nonroot@sha256:b4b14a0dec7ab24661758de61f452cc1bed82619b8cf744000f2aae05c22aeb5 AS build-base
USER 0:0
SHELL ["/busybox/sh", "-ec"]
# npm's bin/npm and bin/npx are Bash launchers. Expose only the JS entrypoint
# symlinks below; the signed minimal parent deliberately has no Bash.
ENV PATH=/nodejs/bin:/busybox:/usr/local/bin:/usr/bin:/bin \
    HOME=/home/node \
    npm_config_script_shell=/busybox/sh \
    NEXT_TELEMETRY_DISABLED=1
COPY vendor/build-tools/npm-11.21.1.tgz /tmp/ornigami-npm.tgz
RUN node -e 'const fs=require("node:fs"),crypto=require("node:crypto");if(process.version!=="v22.23.3"||process.versions.openssl!=="3.5.8")throw Error("Unreviewed Node/OpenSSL version");if(crypto.createHash("sha256").update(fs.readFileSync("/tmp/ornigami-npm.tgz")).digest("hex")!=="dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b")throw Error("npm checksum mismatch")' \
    && mkdir -p /opt/ornigami-npm /app /home/node /usr/bin /bin /usr/local/bin \
    && tar -xzf /tmp/ornigami-npm.tgz --strip-components=1 -C /opt/ornigami-npm \
    && rm /tmp/ornigami-npm.tgz \
    && ln -s /busybox/env /usr/bin/env \
    && ln -s /busybox/sh /bin/sh \
    && ln -s /opt/ornigami-npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /opt/ornigami-npm/bin/npx-cli.js /usr/local/bin/npx \
    && node -e 'const fs=require("node:fs");for(const p of ["/etc/passwd","/etc/group"])if(fs.readFileSync(p,"utf8").split("\n").some(l=>l&&l.split(":")[2]==="1000"))throw Error("UID/GID 1000 already assigned")' \
    && printf 'node:x:1000:1000:Ornigami:/home/node:/sbin/nologin\n' >> /etc/passwd \
    && printf 'node:x:1000:\n' >> /etc/group \
    && chown 1000:1000 /app /home/node \
    && test "$(npm --version)" = 11.21.1
WORKDIR /app
USER 1000:1000

FROM build-base AS deps
COPY --chown=1000:1000 package.json package-lock.json ./
COPY --chown=1000:1000 scripts/vendor/fast-glob-compat ./scripts/vendor/fast-glob-compat
COPY --chown=1000:1000 vendor/framework ./vendor/framework
# Declare the target before installation; never delete foreign packages afterward.
RUN npm ci --os=linux --cpu=x64 --libc=glibc

FROM deps AS builder
COPY --chown=1000:1000 . .
ARG NEXT_PUBLIC_APP_URL
ARG ORNIGAMI_PRIVATE_STAGING_MODE=false
ARG ORNIGAMI_PRIVATE_STAGING_PLATFORM=ordinary
ARG ORNIGAMI_SOURCE_SHA
ARG ORNIGAMI_BUILD_HEAP_MIB=4096
ARG ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=true
ARG ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false
ARG ORNIGAMI_BUILD_WEBPACK_WORKER=false
LABEL org.opencontainers.image.revision=${ORNIGAMI_SOURCE_SHA}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    AUTH_URL=${NEXT_PUBLIC_APP_URL} \
    ORNIGAMI_PRIVATE_STAGING_MODE=${ORNIGAMI_PRIVATE_STAGING_MODE} \
    ORNIGAMI_PRIVATE_STAGING_PLATFORM=${ORNIGAMI_PRIVATE_STAGING_PLATFORM} \
    ORNIGAMI_CONTAINER_BUILD=true \
    ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=${ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS} \
    ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=${ORNIGAMI_BUILD_DISABLE_SOURCEMAPS} \
    ORNIGAMI_BUILD_WEBPACK_WORKER=${ORNIGAMI_BUILD_WEBPACK_WORKER} \
    NODE_OPTIONS=--max-old-space-size=${ORNIGAMI_BUILD_HEAP_MIB} \
    AUTH_SECRET=rehearsal-only-synthetic-build-secret-not-for-use \
    GOOGLE_CLIENT_ID=rehearsal.invalid \
    GOOGLE_CLIENT_SECRET=rehearsal-only-placeholder-not-a-provider-credential \
    NODE_ENV=production
RUN node -e 'if(!/^[0-9a-f]{40}$/.test(process.env.ORNIGAMI_SOURCE_SHA??"")||!process.env.NEXT_PUBLIC_APP_URL)throw Error("Build identity/origin missing");if(process.env.ORNIGAMI_BUILD_HEAP_MIB!=="4096"||process.env.ORNIGAMI_BUILD_DISABLE_SOURCEMAPS!=="false"||process.env.ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS!=="true"||process.env.ORNIGAMI_BUILD_WEBPACK_WORKER!=="false")throw Error("Unreviewed build arguments");const p=process.env.ORNIGAMI_PRIVATE_STAGING_PLATFORM,m=process.env.ORNIGAMI_PRIVATE_STAGING_MODE;if(p==="coolify"){if(m!=="true"||process.env.NEXT_PUBLIC_APP_URL!=="https://staging.ornigami.com")throw Error("Invalid private Coolify build profile")}else if(p!=="ordinary"||m!=="false")throw Error("Invalid ordinary build profile")' \
    && npm run build \
    && mkdir -p .next/cache \
    && node -e 'const s=require("node:fs").statSync(".next/cache");if(s.uid!==1000||s.gid!==1000)throw Error("Cache ownership drift")'

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
      org.ornigami.public-origin=${NEXT_PUBLIC_APP_URL}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/home/node \
    PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin \
    ORNIGAMI_PRIVATE_STAGING_MODE=false \
    ORNIGAMI_PRIVATE_STAGING_PLATFORM=ordinary \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=512
COPY --from=build-base --chown=0:0 /etc/passwd /etc/passwd
COPY --from=build-base --chown=0:0 /etc/group /etc/group
COPY --from=build-base --chown=1000:1000 /home/node /home/node
COPY --from=prod-deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=builder --chown=1000:1000 /app/.next ./.next
COPY --from=builder --chown=1000:1000 /app/public ./public
COPY --from=builder --chown=1000:1000 /app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=1000:1000 /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=1000:1000 /app/src/lib/security-headers.ts ./src/lib/security-headers.ts
COPY --from=builder --chown=1000:1000 /app/src/lib/env.ts ./src/lib/env.ts
COPY --from=builder --chown=1000:1000 /app/scripts/coolify-cron-dispatch.mjs ./scripts/coolify-cron-dispatch.mjs
COPY --from=builder --chown=1000:1000 /app/scripts/vps-cron-dispatch.mjs ./scripts/vps-cron-dispatch.mjs
COPY --from=builder --chown=1000:1000 /app/deploy/coolify/runtime-probes.mjs ./deploy/coolify/runtime-probes.mjs
COPY --from=builder --chown=1000:1000 /app/deploy/coolify/verify-runtime-config.mjs ./deploy/coolify/verify-runtime-config.mjs
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(1500)}).then(async r=>{await r.body?.cancel();process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
