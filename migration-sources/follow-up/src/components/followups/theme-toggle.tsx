"use client";

import { useEffect, useSyncExternalStore } from "react";
import { buttonStyles } from "@/components/followups/button";

const THEME_STORAGE_KEY = "ornigami-theme";

export function ThemeToggle() {
  const darkMode = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("ornigami-theme-change", onChange);
      return () => window.removeEventListener("ornigami-theme-change", onChange);
    },
    () => window.localStorage.getItem(THEME_STORAGE_KEY) === "dark",
    () => false
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  function toggle() {
    const nextValue = !darkMode;
    document.documentElement.classList.toggle("dark", nextValue);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextValue ? "dark" : "light");
    window.dispatchEvent(new Event("ornigami-theme-change"));
  }

  return (
    <button type="button" onClick={toggle} className={buttonStyles("outline")} aria-pressed={darkMode}>
      {darkMode ? "Light mode" : "Dark mode"}
    </button>
  );
}
