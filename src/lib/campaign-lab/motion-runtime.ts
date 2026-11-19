/** App-owned progressive enhancement. Self-contained so its exact function can
 * be packaged as a classic local script, without eval, imports, or a CDN. */
export function initializeCampaignMotion(root: HTMLElement, recipe: string): () => void {
  const cleanups: Array<() => void> = [];
  const dispose = () => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    delete root.dataset.motionState;
  };
  try {
    const image = root.querySelector<HTMLImageElement>("figure img");
    if (!image || recipe === "none") return dispose;
    const view = root.ownerDocument.defaultView;
    if (!view) return dispose;
    const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
    const listen = (target: EventTarget, name: string, fn: EventListener) => {
      target.addEventListener(name, fn);
      cleanups.push(() => target.removeEventListener(name, fn));
    };
    if (recipe === "quiet-product") {
      let played = false;
      let visible = false;
      let animation: Animation | undefined;
      const cancel = () => {
        animation?.cancel();
        root.dataset.motionState = "settled";
      };
      const play = () => {
        if (played || !visible || root.ownerDocument.hidden || !image.complete) return;
        played = true;
        if (reduced.matches || !image.animate) { cancel(); return; }
        try {
          animation = image.animate(
            [{ transform: "scale(1.025)" }, { transform: "scale(1)" }],
            { duration: 250, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
          );
        } catch { dispose(); return; }
        root.dataset.motionState = "playing";
        animation.onfinish = cancel;
      };
      root.dataset.motionState = "pending";
      listen(image, "load", play);
      listen(reduced, "change", () => { if (reduced.matches) { played = true; cancel(); } });
      listen(root.ownerDocument, "visibilitychange", () => {
        if (root.ownerDocument.hidden) { if (played) cancel(); } else play();
      });
      if (view.IntersectionObserver) {
        const observer = new view.IntersectionObserver((entries) => {
          visible = entries[0]?.isIntersecting ?? false;
          if (!visible && played) cancel(); else play();
        });
        observer.observe(image);
        cleanups.push(() => observer.disconnect());
      } else { visible = true; play(); }
      cleanups.push(cancel);
    } else if (recipe === "product-inspect") {
      const doc = root.ownerDocument;
      const dialog = doc.createElement("dialog");
      if (typeof dialog.showModal !== "function") return dispose;
      dialog.className = "ornigami-inspector";
      dialog.dataset.ornigamiMotionUi = "true";
      dialog.setAttribute("aria-label", "Product inspection");
      const button = (label: string) => {
        const element = doc.createElement("button");
        element.type = "button"; element.textContent = label;
        return element;
      };
      const trigger = button("Inspect product");
      trigger.className = "ornigami-inspect-trigger";
      trigger.dataset.ornigamiMotionUi = "true";
      trigger.setAttribute("aria-haspopup", "dialog");
      const controls = doc.createElement("div"); controls.className = "ornigami-inspect-controls";
      const close = button("Close inspection");
      const zoom = button("Enlarge image"); zoom.setAttribute("aria-pressed", "false");
      const directions = doc.createElement("div"); directions.hidden = true;
      directions.className = "ornigami-inspect-directions";
      directions.setAttribute("role", "group"); directions.setAttribute("aria-label", "Inspect without dragging");
      const pane = doc.createElement("div"); pane.className = "ornigami-inspect-pane";
      pane.tabIndex = 0; pane.setAttribute("role", "region"); pane.setAttribute("aria-label", "Product image; scroll to inspect when enlarged");
      const full = doc.createElement("img"); full.src = image.currentSrc || image.src;
      full.alt = image.alt; full.width = image.naturalWidth || image.width;
      full.height = image.naturalHeight || image.height;
      for (const [label, symbol, x, y] of [["Inspect left", "←", -1, 0], ["Inspect up", "↑", 0, -1], ["Inspect down", "↓", 0, 1], ["Inspect right", "→", 1, 0]] as const) {
        const direction = button(symbol); direction.setAttribute("aria-label", label);
        listen(direction, "click", () => pane.scrollBy({ left: x * pane.clientWidth * .65, top: y * pane.clientHeight * .65, behavior: "instant" }));
        directions.append(direction);
      }
      pane.append(full); controls.append(close, zoom, directions); dialog.append(controls, pane);
      const reset = () => { pane.classList.remove("ornigami-inspect-enlarged"); directions.hidden = true; zoom.textContent = "Enlarge image"; zoom.setAttribute("aria-pressed", "false"); pane.scrollTo(0, 0); };
      listen(trigger, "click", () => {
        if (dialog.open) return;
        try { reset(); dialog.showModal(); close.focus({ preventScroll: true }); }
        catch { dispose(); } // Transactional failure leaves the original image and CTA.
      });
      listen(close, "click", () => dialog.close());
      listen(dialog, "close", () => { reset(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); });
      listen(dialog, "click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect(); const pointer = event as MouseEvent;
        if (pointer.clientX < rect.left || pointer.clientX > rect.right || pointer.clientY < rect.top || pointer.clientY > rect.bottom) dialog.close();
      });
      listen(zoom, "click", () => {
        const enlarged = pane.classList.toggle("ornigami-inspect-enlarged");
        directions.hidden = !enlarged;
        zoom.textContent = enlarged ? "Fit image" : "Enlarge image";
        zoom.setAttribute("aria-pressed", String(enlarged));
        // Begin on the product's centre rather than the packshot's empty corner.
        pane.scrollTo({ left: enlarged ? (pane.scrollWidth - pane.clientWidth) / 2 : 0, top: enlarged ? (pane.scrollHeight - pane.clientHeight) / 2 : 0, behavior: "instant" });
      });
      cleanups.push(() => { if (dialog.open) dialog.close(); dialog.remove(); trigger.remove(); });
      image.closest("figure")?.append(trigger);
      root.append(dialog);
      root.dataset.motionState = "ready";
    }
    return dispose;
  } catch {
    dispose();
    return () => {}; // Enhancement failure must not take down the campaign.
  }
}

export function campaignMotionRuntimeSource(): string {
  return `"use strict";\n(${initializeCampaignMotion.toString()})(document.querySelector("article"),JSON.parse(document.getElementById("ornigami-motion-config").textContent).recipe);\n`;
}
