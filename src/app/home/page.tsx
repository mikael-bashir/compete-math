"use client"

import { useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { 
  Sword, 
  BookOpen, 
  Megaphone, 
  X,
  ArrowRight
} from "lucide-react"
import { Button, Card, Avatar } from '@shohojdhara/atomix';

// --- CONFIGURATION ---
const BUILDINGS = [
  {
    id: "weekly",
    name: "The High Keep",
    subtitle: "Archives",
    description: "Problems released every Friday 6AM (BST)",
    status: "active",
    path: "m1478 37l-1 11-1 8 1 9-7 10 3 4v10l-4 7-1 8-4 4 5 8 2 12-1 5-7-8-2-8-1 17-7 2v7l2 6h-7l-5-5 1 22-3 5-5 2-1 6 2 17h-4l-2-7-4-1v7h-10l-2-8-3 8-3 4-2-4-1-14-4 7v15l-5 1-3-9-2 10h-4l2 11h-6l1 6 4 4 1 11-3 4 2 4 1 9-6-1-4 4-8-5h-7l-11-4-1 5-2 3-1 6-4 5-4-2-3-5-3-2-2 2v4l1 5 3 5v3l-4 3-1 2 1 3-2 2v4l3 7 14-1 3 3 8 5 5 1 5 6 3 17 1 12 6 1 9-1 10-2 6 1 6 2 11 4 7 1h7l6 1h9v-3h5l3-2 1-19h5 15l11 24 4-1v-2h5v-3l3-2 2-3v-6l1-7 3-5v-5l1-4 3-4 5 1 4 1 6 5 2 1v4h7l8-1 12-3 10-6 6-8h7l-2-6-3-3h-7l-3-18-5-6-3-2 1-4 1-4 3-1v-7l3-5 4-2 8-2h7l-7-4-6-5-10-9 5-4-6-6-9-10v-24l-2-6-2-3-1 4v12l-6-1v12l-5 1-4-3-4 2h-5l-2-3-4-1v-6-5h5v-7l-4-2v-6l-3-4 1-7v-6l-2-4-1-5-1-3h-5l-1-5v-9l-5-1-6 7-2-5-3-4-1-9 4-5-2-5-3-5v-5l-3-4v-4-3l3-3-2-4-2-3-2-2v-3l-1-3-1-6v-8z",
    icon: <Sword className="w-6 h-6 text-amber-200" />,
    link: "/archives"
  },
  {
    id: "community",
    name: "The Town Hall",
    subtitle: "Global",
    description: "Look at leaderboards for each problem, updated daily",
    status: "active",
    path: "m1421 466v8l-5 4 1 10-3 2v4l-3 3h-2v16l7 12 1 18 3 4h6l3-2 17 6 6 5 10-3 1-10 10 3h9l3 5 4 3 3-8 4 2 4-4 18-1-1-4 11-1v-16h3l-1-13 4-1v-13l-2-1 1-12-8-13-4-9v-13l-3-4h-2l-4 8-3 7-1 7-6-2-6-3-2-6-6-5-5-5-2-13-3-4-3 3-1 6-5 6v5h-4l-1 3h-4l-2 2h-5l3 4-4 1v5h-9l-7 2-2 3-6-2z", 
    icon: <BookOpen className="w-6 h-6 text-cyan-200" />,
    link: "/global"
  },
  {
    id: "news",
    name: "River Market",
    subtitle: "Town News",
    status: "active",
    path: "M0 0 Z", // Placeholder path
    icon: <Megaphone className="w-6 h-6 text-emerald-200" />,
    link: "/news"
  },
]

export default function TownCentrePage() {
  const [activeBuilding, setActiveBuilding] = useState<string | null>(null)
  const router = useRouter()

  const handleBuildingClick = (e: React.MouseEvent, building: any) => {
    e.stopPropagation() 

    if (building.status === "locked") return

    if (activeBuilding === building.id) {
      console.log("Navigating to:", building.link)
      // DYNAMIC LINK USAGE: Uses whatever is in the BUILDINGS object
      router.push(building.link)
    } else {
      setActiveBuilding(building.id)
    }
  }

  const handleBackgroundClick = () => {
    setActiveBuilding(null)
  }

  const ORIGINAL_IMAGE_WIDTH = 2946
  const ORIGINAL_IMAGE_HEIGHT = 1248

  return (
    <div className="relative w-screen h-screen bg-neutral-900 overflow-hidden flex flex-col">
      
      <div className="h-[64px] w-full bg-[#3688B7] shrink-0 z-20" /> 

      <div 
        className="relative flex-1 w-full h-full overflow-hidden"
        onClick={handleBackgroundClick}
      >
        
        <Image 
            src="/images/city.png" 
            alt="Town Map"
            fill
            className="object-cover pointer-events-none"
            priority
            quality={100}
            unoptimized
            style={{ objectPosition: 'bottom center' }} 
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none mix-blend-multiply" />

        <svg 
            viewBox={`0 0 ${ORIGINAL_IMAGE_WIDTH} ${ORIGINAL_IMAGE_HEIGHT}`} 
            className="absolute inset-0 w-full h-full z-10"
            preserveAspectRatio="xMidYMid slice"
        >
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {BUILDINGS.map((building) => (
            <g key={building.id} 
                className="cursor-pointer group pointer-events-auto"
                onClick={(e) => handleBuildingClick(e, building)}
            >
                <motion.path 
                    d={building.path} 
                    fill={activeBuilding === building.id ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.05)"}
                    stroke="white"
                    strokeWidth={activeBuilding === building.id ? "5" : "3"}
                    animate={{
                      strokeOpacity: activeBuilding === building.id ? 1 : [0.3, 0.8, 0.3],
                      filter: activeBuilding === building.id 
                        ? "drop-shadow(0 0 15px rgba(255,255,255,0.9))" 
                        : [
                            "drop-shadow(0 0 2px rgba(255,255,255,0.3))",
                            "drop-shadow(0 0 15px rgba(255,255,255,0.8))",
                            "drop-shadow(0 0 2px rgba(255,255,255,0.3))"
                          ]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                />
            </g>
            ))}
        </svg>

        <AnimatePresence mode="wait">
          {/* FIXED: Removed the hardcoded checks (&& !== 'community' etc).
            Now simply checks if *any* building is active.
          */}
          {activeBuilding ? (
              <motion.div 
                key="modal"
                initial={{ opacity: 0, y: 40, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="absolute bottom-10 z-50 w-full flex justify-center px-4 pointer-events-none"
              >
                  <div 
                    className="
                      pointer-events-auto relative
                      flex flex-col md:flex-row items-start md:items-center gap-5 p-5 pr-8
                      bg-black/80 backdrop-blur-xl 
                      border border-white/10 rounded-3xl 
                      shadow-[0_20px_50px_rgba(0,0,0,0.6)]
                      max-w-md md:max-w-xl
                    "
                    onClick={(e) => e.stopPropagation()}
                  >
                      <button 
                        onClick={() => setActiveBuilding(null)}
                        className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      {(() => {
                          const b = BUILDINGS.find(x => x.id === activeBuilding)!
                          return (
                              <>
                                  <div className="flex items-center gap-5 w-full">
                                      <div className="
                                          w-14 h-14 rounded-2xl flex items-center justify-center
                                          border border-white/10 shadow-inner shrink-0
                                          bg-gradient-to-br from-white/10 to-transparent
                                      ">
                                          {b.icon}
                                      </div>
                                      <div className="flex-1">
                                          <h2 className="text-2xl font-serif text-white leading-none mb-1">{b.name}</h2>
                                          <p className="text-amber-400/90 text-xs font-bold uppercase tracking-widest mb-1">
                                              {b.subtitle}
                                          </p>
                                          <p className="text-white/60 text-xs leading-relaxed">
                                              {b.description}
                                          </p>
                                      </div>
                                  </div>

                                  <button 
                                    // DYNAMIC LINK USAGE:
                                    onClick={() => router.push(b.link)}
                                    className="
                                      mt-4 md:mt-0 md:ml-4
                                      flex items-center gap-2 px-5 py-2.5 
                                      bg-white text-black font-bold text-sm rounded-full 
                                      hover:bg-amber-400 transition-colors shrink-0
                                      w-full md:w-auto justify-center
                                    "
                                  >
                                    Enter <ArrowRight className="w-4 h-4" />
                                  </button>
                              </>
                          )
                      })()}
                  </div>
              </motion.div>
          ) : null}
        </AnimatePresence>
      
      </div>
    </div>
  )
}