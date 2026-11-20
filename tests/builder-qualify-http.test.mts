import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helper = fileURLToPath(new URL("../deploy/builder/qualify-http.mjs", import.meta.url));

type SmokeFixture = {
  mode: "invite" | "closed";
  builderStatus?: number;
  location?: string | null;
  sessionStatus?: number;
  generationStatus?: number;
};

type ProcessResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

function runProcess(args: string[], env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

async function runSmoke(fixture: SmokeFixture) {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("builder home");
      return;
    }
    if (request.method === "GET" && url.pathname === "/builder") {
      const status = fixture.builderStatus ?? (fixture.mode === "invite" ? 307 : 404);
      const headers: Record<string, string> = {};
      if (fixture.location !== null) {
        const configured =
          fixture.location ?? (fixture.mode === "invite" ? "/?error=session" : undefined);
        const location = configured?.replaceAll("{origin}", baseUrl);
        if (location) headers.location = location;
      }
      response.writeHead(status, headers);
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/builder/session") {
      response.writeHead(fixture.sessionStatus ?? 401, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/builder/generate") {
      response.writeHead(fixture.generationStatus ?? 404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await runProcess([helper, "smoke", "--mode", fixture.mode], {
      ...process.env,
      QUALIFY_BASE_URL: baseUrl,
      QUALIFY_ORIGIN: baseUrl,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function assertPass(result: ProcessResult) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function assertFail(result: ProcessResult, pattern: RegExp) {
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, pattern);
}

test("invite smoke accepts only a same-origin 307 to /?error=session", async () => {
  assertPass(await runSmoke({ mode: "invite" }));
  assertPass(await runSmoke({ mode: "invite", location: "{origin}/?error=session" }));
});

test("closed smoke requires 404 and no redirect", async () => {
  assertPass(await runSmoke({ mode: "closed" }));
  assertFail(await runSmoke({ mode: "closed", builderStatus: 307, location: "/?error=session" }),
    /closed anonymous \/builder expected status 404, got 307/);
});

test("swapped mode behavior and redirect targets fail closed", async () => {
  assertFail(await runSmoke({ mode: "invite", builderStatus: 404, location: null }),
    /invite anonymous \/builder expected status 307, got 404/);
  assertFail(await runSmoke({ mode: "invite", location: null }),
    /invite anonymous \/builder redirect is missing Location/);
  assertFail(await runSmoke({ mode: "invite", location: "/?error=unavailable" }),
    /redirect target is not \/\?error=session/);
  assertFail(await runSmoke({ mode: "invite", location: "https://attacker.example/?error=session" }),
    /redirect left the qualification origin/);
});

test("anonymous session and generation denial are mandatory", async () => {
  assertFail(await runSmoke({ mode: "invite", sessionStatus: 200 }),
    /anonymous session expected status 401, got 200/);
  assertFail(await runSmoke({ mode: "invite", generationStatus: 200 }),
    /anonymous generation expected status 404, got 200/);
  assertFail(await runSmoke({ mode: "closed", generationStatus: 200 }),
    /anonymous generation expected status 404, got 200/);
});

test("smoke refuses a missing or unknown mode", () => {
  const missing = spawnSync(process.execPath, [helper, "smoke"], {
    encoding: "utf8",
    env: { ...process.env, QUALIFY_BASE_URL: "http://127.0.0.1:9" },
    timeout: 15_000,
    windowsHide: true,
  });
  assertFail(missing, /smoke requires --mode invite or --mode closed/);
});
