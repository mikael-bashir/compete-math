"use client";

import { useState } from "react";
import Image from "next/image";

// Static, art-driven backdrop for the home dashboard. The wrapper is painted
// with the requested home fallback colour (#180f0e) so that colour is the
// suspense fallback shown until the large image decodes; the image then fades
// in over it.
export function StaticArtBackground({ src = "/images/blood-night-art-mk2.png" }: { src?: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#180f0e]" aria-hidden>
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        onLoad={() => setLoaded(true)}
        className={`object-cover object-center opacity-90 transition-opacity duration-700 ${loaded ? "opacity-90" : "opacity-0"}`}
      />

      {/* Gentle top/bottom shaping, darkening toward the footer */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom,
            rgba(24, 12, 16, 0.35) 0%,
            rgba(24, 12, 16, 0.05) 30%,
            rgba(24, 12, 16, 0.25) 65%,
            rgba(18, 10, 13, 0.85) 100%
          )`,
        }}
      />

      {/* Soft vignette for focus */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 75% at 50% 38%,
            transparent 0%,
            rgba(18, 10, 13, 0.25) 75%,
            rgba(18, 10, 13, 0.55) 100%
          )`,
        }}
      />
    </div>
  );
}
