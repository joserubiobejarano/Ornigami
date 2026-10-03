import { createServer } from "node:http";

const landing = createServer((request, response) => {
  console.log(`Redirect destination received ${request.method} ${request.url}`);
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Redirect destination reached</title><p>Form redirect reached the second local origin.</p>");
});
await new Promise((resolve, reject) => {
  landing.once("error", reject);
  landing.listen(0, "127.0.0.1", resolve);
});
const landingAddress = landing.address();
const landingUrl = `http://127.0.0.1:${landingAddress.port}/landing`;

const source = createServer((request, response) => {
  console.log(`Source origin received ${request.method} ${request.url}`);
  if (request.method === "POST" && request.url === "/redirect") {
    response.writeHead(303, { location: landingUrl });
    response.end();
    return;
  }
  const allowRedirect = new URL(request.url, "http://127.0.0.1").searchParams.get("allow") === "1";
  const formAction = allowRedirect ? `form-action 'self' http://127.0.0.1:${landingAddress.port}` : "form-action 'self'";
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'self'; ${formAction}; object-src 'none'; base-uri 'self'`,
  });
  response.end(`<!doctype html><title>${allowRedirect ? "Allowed" : "Blocked"} local form redirect</title><form action="/redirect" method="post"><button type="submit">Submit local form</button></form>`);
});
await new Promise((resolve, reject) => {
  source.once("error", reject);
  source.listen(0, "127.0.0.1", resolve);
});
const sourceAddress = source.address();
console.log(`CSP form-action redirect fixture ready: http://127.0.0.1:${sourceAddress.port}/`);
console.log(`Expected redirect destination: ${landingUrl}`);
console.log(`Open the source URL with ?allow=1 to explicitly allow that destination in form-action.`);
console.log("Press Ctrl+C to stop the local fixture.");
await new Promise((resolve) => {
  process.once("SIGINT", resolve);
  process.once("SIGTERM", resolve);
});
await Promise.all([
  new Promise((resolve) => source.close(resolve)),
  new Promise((resolve) => landing.close(resolve)),
]);
