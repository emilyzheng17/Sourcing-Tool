import { useEffect, useState } from "react";

const STORAGE_KEY = "sourcing-theme";

function readInitialTheme() {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Persists light/dark mode on document.documentElement and localStorage.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t) => setThemeState(t === "dark" ? "dark" : "light");
  const toggleTheme = () => setThemeState((p) => (p === "dark" ? "light" : "dark"));

  return { theme, setTheme, toggleTheme };
}
