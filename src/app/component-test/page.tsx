'use client';

import FullMoon from "@/components/art/moon";
import Image from "next/image";

/**
 * This is the main page component that will render your FullMoon component.
 * It's set up to be a client component as you requested.
 */
export default function HomePage() {
  return (
    <div>
      <Image
        src={'/images/masterpiece.png'}
        alt="A dark sky with a bright full moon and wispy clouds"
        fill // This prop makes the image fill its parent container
        style={{ 
          objectFit: 'cover', // This prevents the image from stretching/distorting
          zIndex: -1          // This puts the image in the "back" of the container
        }}
        sizes="100vw"
        quality={90}
        priority
      />

      {/* Overlay Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl md:text-6xl font-semibold text-white tracking-tight">
          <div className="opacity-90 pb-5 pt-5 text-[65pt] tracking-normal font-normal">CompeteMath</div>
        </h1>

        <p className="text-white/80 text-lg md:text-xl">
          A site dedicated to competition,

        </p>
        <p className="text-white/80 text-lg md:text-xl">

          and advancing the frontier of Mathematics.
        </p>

        <button
          className="mt-8 px-6 py-3 bg-white text-black font-medium rounded-md hover:bg-gray-200 transition"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
