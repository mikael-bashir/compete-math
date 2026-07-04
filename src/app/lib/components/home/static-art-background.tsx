import Image from "next/image";

// Static, art-driven backdrop for the home dashboard. Replaces the animated
// world-map canvas with a fixed piece from /public so the page feels like a
// deliberate scene rather than a floating widget board.
export function StaticArtBackground({ src = "/images/city.png" }: { src?: string }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0f14]" aria-hidden>
      {/* The artwork itself — fixed, non-interactive, fills the viewport */}
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-55"
      />

      {/* Darkening gradient so foreground cards stay readable */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom,
            rgba(10, 15, 20, 0.55) 0%,
            rgba(10, 15, 20, 0.35) 35%,
            rgba(10, 15, 20, 0.65) 75%,
            rgba(10, 15, 20, 0.92) 100%
          )`,
        }}
      />

      {/* Soft vignette for focus */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 70% at 50% 40%,
            transparent 0%,
            rgba(10, 15, 20, 0.35) 70%,
            rgba(10, 15, 20, 0.75) 100%
          )`,
        }}
      />
    </div>
  );
}
