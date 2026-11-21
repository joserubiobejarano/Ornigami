#!/usr/bin/env node
/**
 * Edge/TLS/private-access/CSP/SRI acceptance for synthetic private staging.
 * Requires an already deployed origin; it never deploys or changes DNS.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";

const origin = process.env.STAGING_ORIGIN;
const user = process.env.STAGING_BASIC_AUTH_USER;
const password = process.env.STAGING_BASIC_AUTH_PASSWORD;
const expectedImageId = process.env.EXPECTED_IMAGE_ID ?? "";
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA ?? "";
const harnessSha = process.env.HARNESS_SHA ?? "";
const evidenceDir =
  process.env.STAGING_EVIDENCE_DIR ?? path.join(process.cwd(), ".local", "private-staging-acceptance");
if (!origin) throw new Error("STAGING_ORIGIN is required");
if (!user || !password) throw new Error("STAGING_BASIC_AUTH_USER/PASSWORD are required");
if (!/^sha256:[0-9a-f]{64}$/.test(expectedImageId)) {
  throw new Error("EXPECTED_IMAGE_ID must be the immutable sha256:<64-hex> image ID");
}
if (!/^[0-9a-f]{40}$/.test(expectedSourceSha)) {
  throw new Error("EXPECTED_SOURCE_SHA must be the application's 40-hex source SHA");
}
if (!/^[0-9a-f]{40}$/.test(harnessSha)) {
  throw new Error("HARNESS_SHA must be the 40-hex acceptance harness commit");
}
const identity = {
  applicationSourceSha: expectedSourceSha,
  harnessSha,
  imageId: expectedImageId,
};
const base = new URL(origin);
if (base.protocol !== "https:") throw new Error("STAGING_ORIGIN must use https:");
mkdirSync(evidenceDir, { recursive: true });
const basic = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const checks = [];

function record(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail: ok ? "" : String(detail).slice(0, 500) });
}
function skip(name, reason) {
  checks.push({ name, ok: false, skipped: true, detail: String(reason).slice(0, 500) });
}
async function check(name, work) {
  try {
    const result = await work();
    if (result?.skip) return skip(name, result.reason);
    record(name, result?.ok ?? true, result?.detail ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function request(url, { method = "GET", headers = {}, body = null, allowHttp = false } = {}) {
  const parsed = new URL(url);
  const client = allowHttp || parsed.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = client.request(parsed, { method, headers, timeout: 8000 }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes <= 2 * 1024 * 1024) chunks.push(chunk);
      });
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function authorized(url, options = {}) {
  return request(url, {
    ...options,
    headers: { ...(options.headers ?? {}), authorization: basic },
  });
}

function scriptTags(html) {
  const tags = [];
  const matcher = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(matcher)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attributes[attribute[1].toLowerCase()] = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    }
    tags.push(attributes);
  }
  return tags;
}

await check("tls:verify", () =>
  new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: base.hostname, port: Number(base.port || 443), servername: base.hostname },
      () => {
        const certificate = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        const authorized = socket.authorized;
        const validTo = certificate.valid_to;
        socket.end();
        resolve({
          ok: authorized && ["TLSv1.2", "TLSv1.3"].includes(protocol) && Boolean(validTo),
          detail: { authorized, protocol, validTo },
        });
      },
    );
    socket.once("error", reject);
    socket.setTimeout(8000, () => socket.destroy(new Error("TLS timeout")));
  }),
);

await check("http:redirect", async () => {
  const response = await request(`http://${base.host}/`, { allowHttp: true });
  const location = response.headers.location ?? "";
  return {
    ok:
      [301, 308].includes(response.status) &&
      location.startsWith("https://") &&
      new URL(location).hostname === base.hostname,
    detail: { status: response.status, locationHost: location ? new URL(location).hostname : null },
  };
});

await check("access:anonymous", async () => {
  const response = await request(base.href);
  return {
    ok:
      response.status === 401 &&
      /basic/i.test(String(response.headers["www-authenticate"] ?? "")) &&
      !/Enter builder/i.test(response.body),
    detail: { status: response.status },
  };
});

await check("access:wrong-credentials", async () => {
  const response = await request(base.href, {
    headers: { authorization: `Basic ${Buffer.from(`${user}:wrong-password`).toString("base64")}` },
  });
  return { ok: response.status === 401, detail: { status: response.status } };
});

await check("access:authorized", async () => {
  const response = await authorized(base.href);
  return {
    ok: response.status === 200 && /Ornigami Builder|Enter builder/i.test(response.body),
    detail: { status: response.status },
  };
});

await check("hsts:header", async () => {
  const response = await authorized(base.href);
  const hsts = String(response.headers["strict-transport-security"] ?? "");
  return { ok: /max-age=(?:3[1-9]|[4-9][0-9]|\d{3,})/i.test(hsts), detail: hsts };
});

await check("csp:header", async () => {
  const response = await authorized(base.href);
  const csp = String(response.headers["content-security-policy"] ?? "");
  const scriptSrc = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] ?? "";
  const connectSrc = csp.match(/(?:^|;)\s*connect-src\s+([^;]+)/i)?.[1] ?? "";
  return {
    ok:
      csp.length > 0 &&
      /'nonce-[^']+'/.test(scriptSrc) &&
      !/'unsafe-(?:inline|eval)'/.test(scriptSrc) &&
      /'self'/.test(connectSrc) &&
      !/https?:\/\//.test(connectSrc),
    detail: { scriptSrc, connectSrc },
  };
});

await check("origin:anonymous-builder", async () => {
  const response = await authorized(`${base.origin}/builder`);
  const location = String(response.headers.location ?? "");
  const target = location ? new URL(location, base) : null;
  return {
    ok:
      response.status === 307 &&
      target?.origin === base.origin &&
      target?.pathname === "/" &&
      target?.search === "?error=session",
    detail: { status: response.status, location },
  };
});

await check("origin:anonymous-session", async () => {
  const response = await authorized(`${base.origin}/api/builder/session`);
  return { ok: response.status === 401, detail: { status: response.status } };
});

await check("origin:anonymous-generation", async () => {
  const response = await authorized(`${base.origin}/api/builder/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  return { ok: response.status === 404, detail: { status: response.status } };
});

await check("origin:unexpected-host", async () => {
  const response = await authorized(base.href, { headers: { host: "unexpected.invalid" } });
  return { ok: response.status !== 200, detail: { status: response.status } };
});

await check("sri:initial", async () => {
  const page = await authorized(base.href);
  const tags = scriptTags(page.body).filter((tag) => tag.src);
  const issues = [];
  const scripts = [];
  let verified = 0;
  for (const tag of tags) {
    const url = new URL(tag.src, base);
    const script = {
      src: url.href,
      path: url.pathname,
      integrity: tag.integrity ?? "",
      sha256: null,
      verified: false,
    };
    if (url.origin !== base.origin) {
      script.issue = "external-origin";
      issues.push({ src: url.origin, issue: "external-origin" });
      scripts.push(script);
      continue;
    }
    if (!tag.integrity) {
      script.issue = "missing-integrity";
      issues.push({ src: url.pathname, issue: "missing-integrity" });
      scripts.push(script);
      continue;
    }
    const asset = await authorized(url.href);
    const digest = `sha256-${createHash("sha256").update(Buffer.from(asset.body)).digest("base64")}`;
    script.sha256 = `sha256-${createHash("sha256").update(Buffer.from(asset.body)).digest("hex")}`;
    if (!tag.integrity.split(/\s+/).includes(digest)) {
      script.issue = "integrity-mismatch";
      issues.push({ src: url.pathname, issue: "integrity-mismatch" });
      scripts.push(script);
      continue;
    }
    script.verified = true;
    scripts.push(script);
    verified += 1;
  }
  writeFileSync(
    path.join(evidenceDir, "edge-sri-scripts.json"),
    `${JSON.stringify({ label: "initial", scripts, verified, issues, completedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  return {
    ok: tags.length > 0 && issues.length === 0,
    detail: { scripts: tags.length, verified, issues, scriptRecords: scripts },
  };
});

const failed = checks.filter((entry) => !entry.ok && !entry.skipped);
const result = {
  origin: base.origin,
  identity,
  completedAt: new Date().toISOString(),
  ok: failed.length === 0,
  checks,
};
writeFileSync(path.join(evidenceDir, "edge-results.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(
  path.join(evidenceDir, "edge-results.txt"),
  checks.map((entry) => `${entry.skipped ? "skip" : entry.ok ? "ok" : "fail"}\t${entry.name}\t${entry.detail}`).join("\n") + "\n",
);
console.log(JSON.stringify({ ok: result.ok, checks: checks.length, failed: failed.length, evidenceDir }, null, 2));
process.exit(result.ok ? 0 : 1);
