'use client'

import Image from "next/image"
import Link from "next/link"

// The landing hero, shared verbatim by the static page and the equation-film's
// opening frame — the film-mode swap must be pixel-identical. The parent
// provides the positioning context (relative h-screen on the static page,
// absolute inset-0 inside the film's pinned stage).
export default function HeroContent() {
  return (
    <>
      <Image
        src={'/images/true-masterpiece-extended.png'}
        alt="A dark sky with a bright full moon and wispy clouds"
        fill
        style={{ objectFit: 'cover' }}
        sizes="100vw"
        quality={100}
        unoptimized
        priority
      />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4">
        <h1 className="font-display text-4xl md:text-6xl font-semibold text-white tracking-tight">
          <div className="opacity-90 pt-5 md:text-[58pt] xs:text-[36pt] text-[26pt] tracking-tight font-bold text-white">
            Competition<span className="text-amber-300">.</span>
          </div>
        </h1>
        <div className="pb-7">
          <p className="font-code text-white/75 text-base md:text-lg">
            <span className="text-amber-300/80">$</span> the best way to master mathematics
          </p>
        </div>

        <Link
          href="/home"
          className="
            px-7 py-2
            rounded-full
            bg-amber-50/95
            text-black!
            font-medium
            tracking-widest uppercase text-xs
            inline-block text-center
            shadow-[0_0_20px_rgba(255,255,255,0.3)]
            transition-all duration-500 ease-out
            will-change-transform
            hover:scale-105
            hover:bg-amber-50
            hover:shadow-[0_0_60px_rgba(255,255,255,0.7)]
            active:scale-95
            active:duration-150
          "
        >
          Start solving
        </Link>
      </div>
    </>
  )
}
