'use client';

import FullMoon from "@/components/art/moon";
import Image from "next/image";
import { Trophy, Users, Library, ShieldCheck, Star, BrainCircuit, ArrowRight } from "lucide-react"; 
import Link from "next/link";

/**
 * This is the main page component that will render your FullMoon component.
 * It's set up to be a client component as you requested.
 */
export default function HomePage() {
  return (
    <div className="font-serif">
      <div className="relative h-screen w-full">
        {/* Full Screen Art */}
        <Image
          src={'/images/true-masterpiece.png'}
          alt="A dark sky with a bright full moon and wispy clouds"
          fill // This prop makes the image fill its parent container
          style={{ 
            objectFit: 'cover', // This prevents the image from stretching/distorting
            zIndex: -1          // This puts the image in the "back" of the container
          }}
          sizes="100vw"
          quality={100}
          unoptimized
          priority
        />

        {/* Overlay Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-semibold text-white tracking-tight">
            <div className="opacity-90 pt-5 md:text-[65pt] xs:text-[40pt] text-[30pt] tracking-normal font-normal text-white">Competition.</div>
            {/* <div className="opacity-90 pb-5 md:text-[65pt] xs:text-[40pt] 2xs:text-[26pt] 3xs:text-[20pt] text-[15pt]  tracking-normal font-normal">Competition</div> */}
          </h1>
          <div className="pb-7">
            <p className="text-white/80 text-lg md:text-xl italic">
              The best way to master Mathematics.
            </p>
          </div>
          {/* <button
            className="mt-8 px-6 py-3 bg-white text-black font-medium rounded-md hover:bg-gray-200 transition"
          >
            Get Started
          </button> */}

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
            Home
          </Link>
        </div>
      </div>
{/* Information Section */}
      <div className="
        py-24 md:py-32 
        bg-[#13170d]
        relative
        -mt-0.5 /* Your 1px line fix */
        overflow-hidden /* Good practice for alternating layouts */
      ">
        <div className="max-w-6xl mx-auto px-6 space-y-24 md:space-y-32">
          
          {/* Main Title */}
          {/* <h2 className="text-4xl md:text-5xl font-bold text-white text-center">
            Learn through <span className="italic">Competition</span>
          </h2> */}

          {/* Feature 1: Competition (Centered) */}
          <div className="flex flex-col items-center gap-12">
            {/* Text Content */}
            <div className="flex-1 text-center"> {/* Centered text */}
              <div className="inline-flex items-center gap-3 mb-2">
                <p className="text-5xl font-sans md:text-6xl font-bold text-white! text-center">
                  Learn through <span className="italic">Competition</span>
                </p>
              </div>
              <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto"> {/* Ensured centered */}
                Climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted math competitions right here on the site.
              </p>
            </div>
          </div>

          {/* Feature 2: Community (Centered) */}
          <div className="flex flex-col items-center gap-12">
            {/* Text Content */}
            <div className="flex-1 text-center"> {/* Centered text */}
              <div className="inline-flex items-center gap-3 mb-2">
                {/* <Users className="w-6 h-6 text-emerald-400" /> */}
                <p className="text-5xl md:text-6xl font-bold text-white! text-center font-sans">
                  Grow with the Community
                </p>
              </div>
              <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto"> {/* Ensured centered */}
                It's not just about winning. See how others solved complex problems, share your own unique methods, and submit challenges for the entire community to solve.
              </p>
            </div>
          </div>

          {/* Feature 3: Library (Centered) */}
          <div className="flex flex-col items-center gap-12">
            {/* Text Content */}
            <div className="flex-1 text-center"> {/* Centered text */}
              <div className="inline-flex items-center gap-3 mb-2">
                {/* <Library className="w-6 h-6 text-sky-400" /> */}
                <p className="text-5xl font-sans md:text-6xl font-bold text-white! text-center">
                  A living Library
                </p>
              </div>
              <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto"> {/* Ensured centered */}
                Explore a vast library of theorems and problems. Our entire collection is open for community contributions and formally verified using Lean4 integration.
              </p>
            </div>
          </div>

        </div>
      </div>


    </div>
  );
}
