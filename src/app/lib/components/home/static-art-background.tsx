"use client";

// Backdrop for the home dashboard and the learn pages: the site's green
// (#12170d, the landing's own colour) with gentle shaping toward the footer.
// The stock art that used to sit here is gone; only the landing keeps its
// image.
export function StaticArtBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#12170d]" aria-hidden>
      {/* Gentle top/bottom shaping, darkening toward the footer */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom,
            rgba(0, 0, 0, 0.10) 0%,
            rgba(0, 0, 0, 0.00) 30%,
            rgba(0, 0, 0, 0.15) 65%,
            rgba(0, 0, 0, 0.45) 100%
          )`,
        }}
      />

      {/* Soft vignette for focus */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 75% at 50% 38%,
            transparent 0%,
            rgba(0, 0, 0, 0.15) 75%,
            rgba(0, 0, 0, 0.35) 100%
          )`,
        }}
      />
    </div>
  );
}
