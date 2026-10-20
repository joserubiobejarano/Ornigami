type ClockStoreOptions = {
  serverSnapshot: number | null;
  refreshMs: number | null;
  now?: () => number;
  setTimer?: (callback: () => void, milliseconds: number) => number;
  clearTimer?: (timer: number) => void;
};

export function createClockStore({
  serverSnapshot,
  refreshMs,
  now = Date.now,
  setTimer = (callback, milliseconds) => window.setInterval(callback, milliseconds),
  clearTimer = (timer) => window.clearInterval(timer),
}: ClockStoreOptions) {
  let snapshot: number | null = null;
  let timer: number | null = null;
  const listeners = new Set<() => void>();

  function refresh() {
    snapshot = now();
    for (const subscriber of listeners) subscriber();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
      snapshot = now();
      if (refreshMs !== null) {
        timer = setTimer(() => {
          refresh();
        }, refreshMs);
      }
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        if (timer !== null) clearTimer(timer);
        timer = null;
        snapshot = null;
      }
    };
  }

  return {
    subscribe,
    refresh,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
  };
}
