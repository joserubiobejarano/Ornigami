import path from "node:path";
import type { NextConfig } from "next";

const containerBuild = process.env.ORNIGAMI_CONTAINER_BUILD === "true";
const buildMemoryOptimizations =
  containerBuild && process.env.ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS === "true";
const buildWebpackWorker =
  containerBuild && process.env.ORNIGAMI_BUILD_WEBPACK_WORKER === "true";

/**
 * The builder runtime deliberately does not wrap `next.config` with Sentry,
 * reputation-auth validation or any provider configuration. It can build with
 * builder/OS configuration alone.
 */
const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    // The upstream artifact defaults this security-advisory nudge on, which
    // performs a registry fetch during build. The builder build is kept
    // network-quiet; advisory review remains an explicit release gate.
    agentUpgrade: false,
    ...(process.env.NODE_ENV === "development"
      ? {}
      : { sri: { algorithm: "sha256" as const } }),
    ...(containerBuild
      ? {
          cpus: 1,
          ...(buildMemoryOptimizations ? { webpackMemoryOptimizations: true } : {}),
          ...(buildWebpackWorker ? { webpackBuildWorker: true } : {}),
        }
      : {}),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
