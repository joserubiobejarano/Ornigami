"use client";

import { useEffect, useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "ornigami-theme";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener("ornigami-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("ornigami-theme-change", onChange);
  };
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
}

function getServerSnapshot(): boolean {
  return false;
}

export function ThemeSync() {
  const darkMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return null;
}
