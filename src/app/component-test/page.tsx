'use client';

import FullMoon from "@/components/art/moon";
import Image from "next/image";
import { Trophy, Users, Library, ShieldCheck, Star, BrainCircuit } from "lucide-react"; 

/**
 * This is the main page component that will render your FullMoon component.
 * It's set up to be a client component as you requested.
 */
export default function HomePage() {
  return (
    <div>
      <div className="relative h-screen w-full">
        {/* Full Screen Art */}
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
            <div className="opacity-90 pb-5 pt-5 md:text-[65pt] xs:text-[40pt] 2xs:text-[26pt] 3xs:text-[20pt] text-[15pt]  tracking-normal font-normal">CompeteMath</div>
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

      {/* Information Section */}
      <div className="
        py-24 md:py-32 
        bg-[#13170d]
        relative
        mt-[-2px] /* Your 1px line fix */
        overflow-hidden /* Good practice for alternating layouts */
      ">
        <div className="max-w-6xl mx-auto px-6 space-y-24 md:space-y-32">
          
          {/* Main Title */}
          <h2 className="text-4xl md:text-5xl font-bold text-white text-center">
            Learn through <span className="italic">Competition</span>
          </h2>

          {/* Feature 1: Competition (Right) */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            {/* Text Content */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-3">
                <Trophy className="w-6 h-6 text-amber-400" />
                <h3 className="text-3xl font-bold text-white">
                  Compete and Conquer
                </h3>
              </div>
              <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto md:mx-0">
                Climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted math competitions right here on the site.
              </p>
            </div>
            
            {/* --- NEW VISUAL ELEMENT --- */}
            <div className="flex-1 flex justify-center">
              {/* Using a relative container to control the size of the Image */}
              <div className="relative w-full h-64 max-w-sm">
                <Image
                  src="/gems/Not_Very_Studious.png"
                  alt="The 'Not Very Studious' achievement badge: an ornate, leafy gem"
                  layout="fill" // 'fill' will make it fill the parent div
                  objectFit="contain" // 'contain' will ensure the whole image fits without distortion
                  className="drop-shadow-xl" // Optional: add a nice shadow
                />
              </div>
            </div>
            {/* --- END OF NEW VISUAL ELEMENT --- */}

          </div>

          {/* Feature 2: Community (Left) */}
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Text Content */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-3">
                <Users className="w-6 h-6 text-emerald-400" />
                <h3 className="text-3xl font-bold text-white">
                  Grow with the Community
                </h3>
              </div>
              <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto md:mx-0">
                It's not just about winning. See how others solved complex problems, share your own unique methods, and submit challenges for the entire community to solve.
              </p>
            </div>
            {/* Visual Element (e.g., placeholder) */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-sm h-64 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center backdrop-blur-lg">
                <BrainCircuit className="w-24 h-24 text-emerald-400 opacity-50" />
              </div>
            </div>
          </div>

          {/* Feature 3: Library (Right) */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            {/* Text Content */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-3">
                <Library className="w-6 h-6 text-sky-400" />
                <h3 className="text-3xl font-bold text-white">
                  A Living Library
                </h3>
              </div>
              <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto md:mx-0">
                Explore a vast library of theorems and problems. Our entire collection is open for community contributions and formally verified using Lean4 integration.
              </p>
            </div>
            {/* Visual Element (e.g., placeholder) */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-sm h-64 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center backdrop-blur-lg">
                <ShieldCheck className="w-24 h-24 text-sky-400 opacity-50" />
              </div>
            </div>
          </div>

        </div>
      </div>


    </div>
  );
}
