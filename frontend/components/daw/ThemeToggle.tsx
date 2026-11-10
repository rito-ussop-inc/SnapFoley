"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Daylight / nocturne switch.
 * The active theme lives on <html data-theme> (set before paint by layout.tsx),
 * so this component only flips that attribute — CSS handles the icons and label,
 * which keeps server and client markup identical.
 */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("snapfoley-theme", next);
    } catch {
      /* storage can be blocked; the theme still applies for this session */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn h-8"
      aria-label="Toggle light and dark theme"
      title="Toggle light and dark theme"
    >
      <span className="theme-dark inline-flex">
        <Moon size={13} />
      </span>
      <span className="theme-light inline-flex">
        <Sun size={13} />
      </span>
      <span className="hidden sm:inline-flex">
        <span className="theme-dark">Oxblood</span>
        <span className="theme-light">Chalk</span>
      </span>
    </button>
  );
}
