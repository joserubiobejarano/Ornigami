/** Use only through the browser skill's Node REPL and its documented tab/viewport
 * APIs. No alternate browser driver, file navigation or page mutation. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Browser screenshots are JPEG. Read its SOF dimensions without loading a
// native image package into the browser skill's restricted module loader.
function jpegDimensions(bytes) {
  const data = Buffer.from(bytes);
  assert.equal(data.readUInt16BE(0), 0xffd8);
  for (let offset = 2; offset + 9 < data.length;) {
    assert.equal(data[offset], 0xff);
    const marker = data[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5), format: "jpeg" };
    }
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  throw new Error("Screenshot JPEG dimensions are missing");
}

export async function captureStoryViewport(tab, viewport, options) {
  const { width, height = 3600, definition, mode, beatCount, directory, state = "initial" } = options;
  await fs.mkdir(directory, { recursive: true });
  await tab.playwright.locator(`article[data-definition="${definition}"][data-mode="${mode}"][data-ready-images="${beatCount}"]`).waitFor({ state: "attached" });
  // Navigation/hydration happens before this function, never after sizing.
  await viewport.set({ width, height });
  const measure = () => tab.playwright.evaluate(() => {
    const article = document.querySelector("article"), track = article.querySelector(".story-track");
    return { innerWidth, innerHeight, scrollX, scrollY, clientWidth: document.documentElement.clientWidth, dpr: devicePixelRatio,
      article: article.getBoundingClientRect().toJSON(), definition: article.dataset.definition, mode: article.dataset.mode,
      window: article.querySelector(".story-window").getBoundingClientRect().toJSON(), track: track.getBoundingClientRect().toJSON(),
      readyImages: [...article.querySelectorAll("img")].filter(i => i.complete && i.naturalWidth > 0).length,
      images: [...article.querySelectorAll("img")].map(i => ({ id: i.dataset.approvedAssetId, src: i.getAttribute("src"), alt: i.alt, width: i.naturalWidth })),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      enhanced: article.classList.contains("story-enhanced"), transform: getComputedStyle(track).transform,
      transition: getComputedStyle(track).transition, selected: [...article.querySelectorAll(".story-controls button")].map(b => b.getAttribute("aria-pressed")),
      panels: [...article.querySelectorAll(".story-panel")].map(p => ({ rect: p.getBoundingClientRect().toJSON(), inert: p.inert === true, hidden: p.getAttribute("aria-hidden") })),
      text: article.textContent, destination: article.querySelector("a").href,
    };
  });
  const record = { requestedWidth: width, requestedHeight: height, definition, mode, state };
  const name = `${definition}-${mode}-${state}-${width}x${height}`;
  try {
    record.before = await measure();
    assert.equal(record.before.innerWidth, width, "Requested viewport must be measured before capture");
    assert.equal(record.before.innerHeight, height);
    assert.equal(record.before.readyImages, beatCount);
    assert.equal(record.before.definition, definition); assert.equal(record.before.mode, mode);
    assert.equal(record.before.overflow, false);
    assert.equal(record.before.enhanced, mode !== "static");
    assert.equal(record.before.panels.length, beatCount);
    for (const panel of record.before.panels) assert.ok(Math.abs(panel.rect.width - record.before.window.width) <= 1, "Each panel occupies the story window width");
    assert.ok(Math.abs(record.before.track.width - record.before.window.width * (mode === "static" ? 1 : beatCount)) <= 1);
    assert.equal(record.before.panels.filter(p => p.hidden === "true").length, mode === "static" ? 0 : beatCount - 1);
    const { x, y, width: w, height: h } = record.before.article;
    assert.ok(y >= 0 && y + h <= height, "Whole article must fit without capture-induced viewport resizing");
    const bytes = await tab.screenshot({ clip: { x: x + record.before.scrollX, y: y + record.before.scrollY, width: w, height: h } });
    await fs.writeFile(path.join(directory, `${name}.jpg`), bytes);
    const metadata = jpegDimensions(bytes);
    record.screenshot = { file: `${name}.jpg`, width: metadata.width, height: metadata.height, bytes: bytes.length, format: metadata.format };
    record.after = await measure();
    assert.equal(record.after.innerWidth, width, "Viewport changed during capture");
    assert.equal(record.after.innerHeight, height);
    assert.equal(record.after.clientWidth, record.before.clientWidth, "Scrollbar geometry changed during capture");
    assert.deepEqual(record.after.article, record.before.article, "Article geometry changed during capture");
    assert.equal(record.after.readyImages, beatCount);
    assert.ok(Math.abs(metadata.width - w * record.before.dpr) <= 1);
    assert.ok(Math.abs(metadata.height - h * record.before.dpr) <= 1);
    record.status = "passed";
    return record;
  } catch (error) { record.status = "failed"; record.error = error.message; throw error; }
  finally { await fs.writeFile(path.join(directory, `${name}.json`), JSON.stringify(record, null, 2) + "\n"); }
}
