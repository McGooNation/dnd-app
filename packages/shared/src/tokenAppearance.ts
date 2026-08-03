// Token appearance constants shared by web and mobile.
//
// IMPORTANT: server/battleMap.js duplicates PRESET_TOKEN_COLORS (as hex
// values) and TOKEN_SIZES for server-side validation, since the server runs
// as plain JS with no build step and can't import from this TS package
// directly — the same pattern already used for dice validation. Keep the
// two lists in sync if either changes.

export interface PresetColor {
  name: string;
  hex: string;
}

export const PRESET_TOKEN_COLORS: PresetColor[] = [
  { name: "Red", hex: "#e53935" },
  { name: "Dark Red", hex: "#7f1d1d" },
  { name: "Orange", hex: "#f97316" },
  { name: "Gold", hex: "#c9a227" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Green", hex: "#16a34a" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Light Blue", hex: "#38bdf8" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Purple", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Brown", hex: "#92400e" },
  { name: "White", hex: "#f5f5f4" },
  { name: "Black", hex: "#18181b" },
];

// Ordered small -> large. Adding "tiny", "huge", "gargantuan" later is
// adding entries here — nothing that reads TOKEN_SIZES/SIZE_SCALE needs to change.
export const TOKEN_SIZES = ["small", "medium", "large"] as const;
export type TokenSize = (typeof TOKEN_SIZES)[number];

export const SIZE_SCALE: Record<string, number> = {
  small: 0.7,
  medium: 1,
  large: 1.5,
};

/** Picks black or white text for the best contrast against a given hex background. */
export function getContrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#18181b";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#18181b" : "#f5f5f4";
}
