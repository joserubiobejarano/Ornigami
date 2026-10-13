import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const caddy = readFileSync(new URL("../deploy/vps/Caddyfile", import.meta.url), "utf8");
const unit = readFileSync(new URL("../deploy/vps/ornigami.service", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../deploy/vps/runtime.env.example", import.meta.url), "utf8");

test("Caddy overwrites forwarding identity and removes alternate client-supplied identity headers", () => {
  assert.match(caddy, /header_up X-Forwarded-For \{http\.request\.remote\.host\}/);
  for (const name of ["X-Real-IP", "X-Vercel-Forwarded-For", "CF-Connecting-IP", "Forwarded"]) {
    assert.match(caddy, new RegExp(`header_up -${name}(?:\\s|$)`));
  }
  assert.match(caddy, /header_up Host ornigami\.com/);
  assert.match(caddy, /header_up X-Forwarded-Host ornigami\.com/);
  assert.match(caddy, /header_up X-Forwarded-Proto https/);
});

test("systemd serves Next only on loopback with the root-owned runtime env and an unprivileged user", () => {
  assert.match(unit, /User=ornigami/);
  assert.match(unit, /Group=ornigami/);
  assert.match(unit, /EnvironmentFile=\/etc\/ornigami\/runtime\.env/);
  assert.match(unit, /next start --hostname 127\.0\.0\.1 --port 3000/);
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /TimeoutStopSec=45s/);
  assert.match(unit, /ProtectSystem=strict/);
});

test("runtime example uses canonical HTTPS URL and leaves secrets unset", () => {
  assert.match(envExample, /^NEXT_PUBLIC_APP_URL=https:\/\/ornigami\.com$/m);
  for (const name of ["DATABASE_URL", "AUTH_SECRET", "TOKEN_ENCRYPTION_KEY", "GOOGLE_CLIENT_SECRET", "CRON_SECRET"]) {
    assert.match(envExample, new RegExp(`^# ${name}=`, "m"));
    assert.doesNotMatch(envExample, new RegExp(`^${name}=$`, "m"));
  }
  assert.match(envExample, /^# AUTH_URL=https:\/\/ornigami\.com$/m);
  assert.doesNotMatch(envExample, /^SENTRY_(?:ORG|PROJECT|AUTH_TOKEN)=/m);
});
