"use client";

import { useLayoutEffect } from "react";

export const THEME_KEY = "s57-theme";

/** Saved choice wins, otherwise follow the system setting. Self-contained: it is also inlined as a string. */
function applyTheme(key: string) {
  try {
    const saved = localStorage.getItem(key);
    const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    // Storage blocked: keep the server default.
  }
}

const inline = `(${applyTheme.toString()})(${JSON.stringify(THEME_KEY)})`;

/**
 * Sets the theme before first paint (the server-rendered script), and again
 * whenever React re-creates <html> on the client, for example when switching
 * language changes the [locale] root layout and the `dark` class is reset.
 *
 * In the browser the script gets a non-JavaScript type: React never runs
 * scripts it creates, and a data-block type tells it so (no console warning).
 */
export function ThemeScript() {
  useLayoutEffect(() => applyTheme(THEME_KEY), []);

  return (
    <script
      type={typeof window === "undefined" ? undefined : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: inline }}
    />
  );
}
