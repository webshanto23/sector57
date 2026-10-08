"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { THEME_KEY } from "./theme-script";

/** Flips the `.dark` class set by ThemeScript and remembers the choice. */
export function ThemeToggle() {
  const t = useTranslations("Common");

  function toggle() {
    const root = document.documentElement;
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Private mode or blocked storage: the toggle still works for this page.
    }
  }

  return (
    <Button variant="outline" size="pill" onClick={toggle} aria-label={t("themeToggle")} title={t("themeToggle")}>
      <Moon className="dark:hidden" aria-hidden />
      <Sun className="hidden dark:block" aria-hidden />
    </Button>
  );
}
