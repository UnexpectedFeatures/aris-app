export type Appearance = "light" | "dark" | "colorblind" | "system";

const APPEARANCE_KEY = "aris-appearance";

export function applyAppearance(appearance: Appearance) {
  const resolved = appearance === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : appearance;
  document.documentElement.dataset.arisTheme = resolved;
  localStorage.setItem(APPEARANCE_KEY, appearance);
}

export function loadAppearance(): Appearance {
  const saved = localStorage.getItem(APPEARANCE_KEY);
  if (saved === "light" || saved === "dark" || saved === "colorblind" || saved === "system") {
    return saved;
  }
  return "light";
}
