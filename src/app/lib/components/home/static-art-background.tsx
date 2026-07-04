// Static, art-driven backdrop for the home dashboard.
//
// LAG TEST (temporary): the art <Image> is commented out and we render a FLAT
// colour (#2f1f1e — the sampled average of blood-night-art.jpg) instead, to
// check whether the fixed full-screen image is the source of the scroll jank.
// To restore the art: re-enable the <Image> below and re-add `import Image`.

export function StaticArtBackground(_props: { src?: string } = {}) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2f1f1e]" aria-hidden>
      {/* <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-90"
      /> */}

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
