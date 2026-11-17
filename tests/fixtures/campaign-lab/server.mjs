import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(directory, "contract-manifest.json");
const port = Number(process.env.CAMPAIGN_LAB_CONTRACT_PORT ?? process.argv[2] ?? 0);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const fixtures = new Map(manifest.fixtures.map((fixture) => [fixture.name, fixture]));

const assets = new Map([
  ["/campaign-lab/assets/harbor-field-bottle-front.svg", "harbor-field-bottle-front.svg"],
  ["/campaign-lab/assets/morrow-ceramic-dripper.svg", "morrow-ceramic-dripper.svg"],
]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function failFor(faults, name) {
  return faults.split(",").map((value) => value.trim()).includes(name);
}

function page(fixture, faults) {
  const hrefFault = failFor(faults, "href");
  const altFault = failFor(faults, "alt");
  const imageFault = failFor(faults, "image");
  const overflowFault = failFor(faults, "overflow");
  const approvalFault = failFor(faults, "approval");
  const errorFault = failFor(faults, "errors");
  const focusFault = failFor(faults, "focus");
  const legibilityFault = failFor(faults, "legibility");
  const noRegion = failFor(faults, "no-region");
  const longCopy = fixture.name === "long-copy";
  const imagePath = imageFault ? "/campaign-lab/assets/missing-packshot.svg" : fixture.image.path;
  const alt = altFault ? "Product photograph" : fixture.image.alt;
  const href = hrefFault ? "https://example.com/wrong-destination" : fixture.destination;
  const body = longCopy
    ? `<p class="body-copy">The dripper's three interior ribs hold the filter away from the wall. The first prototype held the filter against the wall, so the spacing changed. This paragraph is intentionally long: it tests whether a campaign page can keep the product, offer and action legible without hiding the copy or pushing the primary action out of the preview.</p>
       <p class="body-copy">A second paragraph continues the story with no added claim, rating or performance figure. Its only job is to make the long-copy fixture materially longer than the sparse case while the same campaign template renders both.</p>`
    : `<p class="body-copy">One centered packshot, a clear offer, and one action. Reviews, lifestyle photography and performance tests are not available.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campaign lab contract fixture — ${escapeHtml(fixture.name)}</title>
<style>
  :root { color-scheme: light; --ink:#241f1a; --paper:#f5f0e7; --accent:#a4472c; --line:#d8cbbb; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height:1.45; }
  .banner { padding:10px 16px; background:#241f1a; color:#fff; font-size:13px; letter-spacing:.02em; }
  .shell { display:grid; gap:24px; max-width:1180px; margin:0 auto; padding:24px 16px 48px; }
  .form { display:grid; gap:14px; align-content:start; }
  .field { display:grid; gap:6px; }
  label { font-size:13px; font-weight:650; }
  input { width:100%; min-height:42px; padding:9px 10px; border:1px solid var(--line); border-radius:6px; background:#fffdf9; color:var(--ink); font:inherit; }
  input:focus-visible, button:focus-visible, a:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
  button { min-height:42px; padding:9px 14px; border:1px solid var(--ink); border-radius:6px; background:var(--ink); color:#fff; font:inherit; font-weight:650; cursor:pointer; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .status { margin:0; font-size:13px; font-weight:650; }
  .error { margin:0; padding:9px 10px; border-left:3px solid #9b1c1c; background:#fff1ef; color:#7a1414; font-size:13px; }
  .preview { border:1px solid var(--line); border-radius:10px; background:#fffdf9; overflow:hidden; }
  .preview-inner { padding:22px; display:grid; gap:18px; }
  .preview img { display:block; width:100%; max-width:340px; aspect-ratio:4/5; object-fit:cover; object-position:center; border-radius:8px; background:#e9e0d2; }
  .preview h1 { margin:0; font-family: Georgia, "Times New Roman", serif; font-size:clamp(28px, 5vw, 44px); line-height:1.05; letter-spacing:-.02em; overflow-wrap:anywhere; }
  .preview .offer { margin:0; font-size:clamp(17px, 2.6vw, 20px); font-weight:700; color:var(--accent); overflow-wrap:anywhere; }
  .preview .body-copy { margin:0; max-width:62ch; font-size:16px; overflow-wrap:anywhere; }
  .preview .cta { display:inline-block; justify-self:start; padding:12px 16px; border-radius:6px; background:var(--accent); color:#fff; font-weight:700; text-decoration:none; }
  .preview .terms { margin:0; font-size:13px; color:#5c5147; }
  .overflow-fault { display:block; width:820px; }
  .tiny { font-size:9px !important; color:#c8beb2 !important; }
  @media (min-width: 900px) { .shell { grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); align-items:start; } .preview-inner { grid-template-columns: minmax(220px, 340px) minmax(0, 1fr); align-items:start; } .preview-copy { display:grid; gap:18px; align-content:start; } }
  @media (max-width: 899px) { .preview-inner { padding:16px; } }
  ${focusFault ? ".preview a:focus-visible { outline:none !important; }" : ""}
  ${legibilityFault ? ".preview h1, .preview .offer, .preview .cta { font-size:9px !important; color:#d8cbbb !important; }" : ""}
</style>
</head>
<body>
<div class="banner">Contract test double — synthetic campaign template fixture, not the Ornigami app route.</div>
<main class="shell">
  <form class="form" novalidate>
    <div class="field">
      <label for="product-name">Product name</label>
      <input id="product-name" name="productName" value="${escapeHtml(fixture.product.name)}" required>
    </div>
    <div class="field">
      <label for="offer">Offer</label>
      <input id="offer" name="offer" value="${escapeHtml(fixture.offer)}" required>
    </div>
    <div class="field">
      <label for="destination">Destination URL</label>
      <input id="destination" name="destination" type="url" value="${escapeHtml(fixture.destination)}" required>
    </div>
    <div class="field">
      <label for="product-image">Product image</label>
      <input id="product-image" name="productImage" type="file" accept="image/*">
    </div>
    <button id="generate" type="button">Generate preview</button>
    <button id="approve" type="button" disabled>Approve preview locally</button>
    <p id="status" class="status" role="status">Not approved</p>
    <p id="error" class="error" role="alert" hidden></p>
  </form>
  <section class="preview" ${noRegion ? "" : 'aria-label="Campaign preview"'} data-approved="${approvalFault ? "true" : "false"}" id="preview">
    <div class="preview-inner" id="preview-inner">
      <img id="product-image-preview" src="${escapeHtml(imagePath)}" alt="${escapeHtml(alt)}" width="800" height="1000">
      <div class="preview-copy">
        <h1 id="preview-product">${escapeHtml(fixture.product.name)}</h1>
        <p class="offer" id="preview-offer">${escapeHtml(fixture.offer)}</p>
        <a class="cta" id="preview-cta" href="${escapeHtml(href)}">${escapeHtml(fixture.cta?.name ?? "Continue")}</a>
        ${body}
        <p class="terms">Offer terms appear next to the action. This is synthetic contract copy.</p>
        ${overflowFault ? '<span class="overflow-fault">overflow-fault-overflow-fault-overflow-fault-overflow-fault</span>' : ""}
      </div>
    </div>
  </section>
</main>
<script>
(() => {
  const faults = new Set(${JSON.stringify(faults.split(",").map((value) => value.trim()).filter(Boolean))});
  const errorFault = faults.has("errors");
  const approvalFault = faults.has("approval");
  const form = document.querySelector("form");
  const productName = document.querySelector("#product-name");
  const offer = document.querySelector("#offer");
  const destination = document.querySelector("#destination");
  const generate = document.querySelector("#generate");
  const approve = document.querySelector("#approve");
  const status = document.querySelector("#status");
  const error = document.querySelector("#error");
  const preview = document.querySelector("#preview");
  const previewProduct = document.querySelector("#preview-product");
  const previewOffer = document.querySelector("#preview-offer");
  const previewCta = document.querySelector("#preview-cta");
  const image = document.querySelector("#product-image-preview");
  let approved = ${approvalFault ? "true" : "false"};
  let generated = false;
  let lastValid = { product: productName.value, offer: offer.value, destination: destination.value };

  const visibleError = (message) => {
    if (errorFault) {
      error.hidden = true;
      error.textContent = "";
      return;
    }
    error.hidden = false;
    error.textContent = message;
    offer.setAttribute("aria-invalid", message.includes("offer") ? "true" : "false");
    destination.setAttribute("aria-invalid", message.includes("URL") ? "true" : "false");
  };
  const clearError = () => {
    error.hidden = true;
    error.textContent = "";
    offer.removeAttribute("aria-invalid");
    destination.removeAttribute("aria-invalid");
  };
  const setApproval = (value) => {
    approved = value;
    preview.setAttribute("data-approved", value ? "true" : "false");
    status.textContent = value ? "Approved preview" : "Changes not approved";
  };
  const validate = () => {
    if (!productName.value.trim()) return "Enter a product name before generating a preview.";
    if (!offer.value.trim()) return "Enter an offer before generating a preview.";
    let url;
    try { url = new URL(destination.value.trim()); } catch { return "Enter a complete destination URL, including https://."; }
    if (!/^https?:$/.test(url.protocol)) return "Use an http or https destination URL.";
    return null;
  };
  const invalidate = () => {
    if (!approvalFault) setApproval(false);
    approve.disabled = false;
  };
  productName.addEventListener("input", invalidate);
  offer.addEventListener("input", invalidate);
  destination.addEventListener("input", invalidate);

  generate.addEventListener("click", () => {
    const message = validate();
    if (message) {
      visibleError(message);
      setApproval(false);
      return;
    }
    clearError();
    lastValid = { product: productName.value.trim(), offer: offer.value.trim(), destination: destination.value.trim() };
    previewProduct.textContent = lastValid.product;
    previewOffer.textContent = lastValid.offer;
    if (!faults.has("href")) previewCta.setAttribute("href", lastValid.destination);
    image.setAttribute("alt", faults.has("alt") ? "Product photograph" : ${JSON.stringify(fixture.image.alt)});
    if (!faults.has("image")) image.setAttribute("src", ${JSON.stringify(fixture.image.path)});
    generated = true;
    approve.disabled = false;
    invalidate();
  });

  approve.addEventListener("click", () => {
    const message = validate();
    if (message) {
      visibleError(message);
      setApproval(false);
      return;
    }
    if (!generated) {
      visibleError("Generate a preview before approving it.");
      return;
    }
    clearError();
    setApproval(true);
  });

  previewCta.addEventListener("click", () => {
    // The href is the contract. Navigation is exercised by the acceptance runner.
  });
})();
</script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (url.pathname === "/campaign-lab") {
    const fixture = fixtures.get(url.searchParams.get("fixture") ?? "sparse");
    if (!fixture) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("unknown fixture");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(page(fixture, url.searchParams.get("fault") ?? ""));
    return;
  }
  const asset = assets.get(url.pathname);
  if (asset) {
    try {
      const body = await readFile(path.join(directory, "assets", asset));
      response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing asset");
    }
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.log(`http://127.0.0.1:${address.port}`);
});
