/** Owned, dependency-free enhancement. Static markup is the recovery state. */
export function initializeStory(root: HTMLElement, mode: "static" | "instant" | "motion"): () => void {
  if (mode === "static") return () => {};
  const track = root.querySelector<HTMLElement>(".story-track");
  const panels = Array.from(root.querySelectorAll<HTMLElement>(".story-panel"));
  const controls = root.querySelector<HTMLElement>(".story-controls");
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".story-controls button"));
  if (!track || !controls || (panels.length < 2 || panels.length > 3) || buttons.length !== panels.length) return () => {};
  let selected = 0;
  let active = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  function select(index: number, keyboard = false) {
    if (!active) return;
    selected = Math.max(0, Math.min(panels.length - 1, index));
    track!.style.transition = mode === "motion" && !reduce.matches && !keyboard
      ? "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)" : "none";
    track!.style.transform = `translateX(-${selected * (100 / panels.length)}%)`;
    panels.forEach((panel, i) => { panel.inert = i !== selected; panel.setAttribute("aria-hidden", String(i !== selected)); });
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === selected)));
  }
  function click(event: Event) {
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    select(index, (event as MouseEvent).detail === 0);
  }
  function key(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    select(event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : selected + (event.key === "ArrowRight" ? 1 : -1), true);
    buttons[selected].focus();
  }
  function stopMotion() { track!.style.transition = "none"; }
  function restore() {
    active = false;
    root.classList.remove("story-enhanced");
    root.style.removeProperty("--story-count");
    track!.removeAttribute("style");
    panels.forEach(panel => { panel.inert = false; panel.removeAttribute("aria-hidden"); });
    controls!.hidden = true;
  }
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  if (images.some(image => image.complete && image.naturalWidth === 0)) return () => {};
  try {
    buttons.forEach(button => button.addEventListener("click", click));
    controls.addEventListener("keydown", key);
    reduce.addEventListener("change", stopMotion);
    document.addEventListener("visibilitychange", stopMotion);
    images.forEach(image => image.addEventListener("error", restore));
    root.style.setProperty("--story-count", String(panels.length));
    root.classList.add("story-enhanced");
    controls.hidden = false;
    select(0, true);
  } catch { restore(); }
  return () => {
    restore();
    buttons.forEach(button => button.removeEventListener("click", click));
    controls.removeEventListener("keydown", key);
    reduce.removeEventListener("change", stopMotion);
    document.removeEventListener("visibilitychange", stopMotion);
    images.forEach(image => image.removeEventListener("error", restore));
  };
}

export function storyRuntimeSource(): string {
  return `(${initializeStory.toString()})(document.querySelector('.product-story'),JSON.parse(document.getElementById('ornigami-story-config').textContent).mode);`;
}
