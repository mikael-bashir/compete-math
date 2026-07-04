import Image from "next/image";

// Static, art-driven backdrop for the home dashboard. A fixed painting from
// /public (blood-moon night sky) so the page feels like a deliberate scene
// rather than a floating widget board. The artwork is already dark, so the
// overlays stay light: just enough contrast for cards, plus a bottom fade
// into the footer.
export function StaticArtBackground({ src = "/images/blood-night-art.jpg" }: { src?: string }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#120c10]" aria-hidden>
      {/* The artwork itself — fixed, non-interactive, fills the viewport */}
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-90"
      />

      {/* Gentle top/bottom shaping: keep the crescent moon zone untouched,
          darken toward the bottom where the content and footer live */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom,
            rgba(18, 12, 16, 0.35) 0%,
            rgba(18, 12, 16, 0.05) 30%,
            rgba(18, 12, 16, 0.25) 65%,
            rgba(18, 12, 16, 0.85) 100%
          )`,
        }}
      />

      {/* Soft vignette for focus */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 75% at 50% 38%,
            transparent 0%,
            rgba(18, 12, 16, 0.25) 75%,
            rgba(18, 12, 16, 0.55) 100%
          )`,
        }}
      />
    </div>
  );
}
