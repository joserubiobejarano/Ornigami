import assert from "node:assert/strict";
import test from "node:test";
import {
  createConnectionRequestGuard,
  createGoogleConnectionRequest,
} from "../src/modules/review-replies/services/google-connection-request.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("overlapping connection reads for one business share a request", async () => {
  const response = deferred<Response>();
  const urls: string[] = [];
  const request = createGoogleConnectionRequest(async (url) => { urls.push(url); return response.promise; });

  const first = request("business 1");
  const second = request("business 1");
  assert.equal(first, second);
  assert.deepEqual(urls, ["/api/google/connection?businessId=business%201"]);

  response.resolve(new Response(JSON.stringify({ connected: true }), { status: 200 }));
  assert.deepEqual(await first, { connected: true });
});

test("business scopes stay separate and explicit reload bypasses an in-flight request", async () => {
  const responses = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
  const urls: string[] = [];
  let index = 0;
  const request = createGoogleConnectionRequest(async (url) => {
    urls.push(url);
    return responses[index++].promise;
  });

  const oldBusiness = request("old");
  const otherBusiness = request("new");
  const explicitReload = request("old", { force: true });
  assert.deepEqual(urls, [
    "/api/google/connection?businessId=old",
    "/api/google/connection?businessId=new",
    "/api/google/connection?businessId=old",
  ]);

  responses[0].resolve(new Response(JSON.stringify({ connected: false }), { status: 200 }));
  responses[1].resolve(new Response(JSON.stringify({ connected: true }), { status: 200 }));
  responses[2].resolve(new Response(JSON.stringify({ connected: true, canManage: true }), { status: 200 }));
  assert.deepEqual(await oldBusiness, { connected: false });
  assert.deepEqual(await otherBusiness, { connected: true });
  assert.deepEqual(await explicitReload, { connected: true, canManage: true });
});

test("scope changes and newer reads make older responses stale", () => {
  const guard = createConnectionRequestGuard();
  const oldRequest = guard.begin("old");
  guard.setScope("new");
  assert.equal(guard.isCurrent(oldRequest, "old"), false);

  const currentRequest = guard.begin("new");
  const reload = guard.begin("new");
  assert.equal(guard.isCurrent(currentRequest, "new"), false);
  assert.equal(guard.isCurrent(reload, "new"), true);
});
