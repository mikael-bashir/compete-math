import type { CSSProperties } from "react";

// Prestige (cosmetic) titles render with a live, moving glow — the SAME
// treatment the "CompeteMath" wordmark uses (navstrip/footer): a wide gradient
// clipped to the text, swept by the shared `shimmer` keyframe (globals.css),
// plus a coloured drop-shadow halo. Colours come from the DB per title
// (titles.colorFrom / colorTo / textColor) so new prestige titles need no code.
//
// Two modes:
//   - textColor null  -> the text IS the gradient (colorFrom -> colorTo), e.g.
//     "Impervious" (purple -> blue).
//   - textColor set   -> that colour is the base and colorFrom shimmers through
//     it, e.g. "The Indomitable" (black text with a purple sweep).

// Applied alongside the returned inline style. `animate-shimmer` maps to the
// `--animate-shimmer` theme token (shimmer 3s linear infinite).
export const PRESTIGE_TITLE_CLASS = "bg-clip-text text-transparent filter animate-shimmer";

export function prestigeTitleStyle(
  colorFrom?: string | null,
  colorTo?: string | null,
  textColor?: string | null,
): CSSProperties | null {
  if (!colorFrom) return null;
  const to = colorTo || colorFrom;
  // Gradients loop seamlessly as the shimmer pans background-position across a
  // 200% background-size (matching the wordmark). Black-base variants weave
  // BOTH accents through the base (black -> accent1 -> accent2 -> black) so the
  // two colours read as one family; gradient-text variants just sweep the pair.
  const gradient = textColor
    ? `linear-gradient(90deg, ${textColor}, ${colorFrom}, ${to}, ${textColor})`
    : `linear-gradient(90deg, ${colorFrom}, ${to}, ${colorFrom})`;
  return {
    backgroundImage: gradient,
    backgroundSize: "200% auto",
    filter: `drop-shadow(0 0 4px ${colorFrom}) drop-shadow(0 0 10px ${to})`,
  };
}
