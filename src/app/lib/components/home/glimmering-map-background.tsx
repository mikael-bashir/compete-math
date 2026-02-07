"use client"

import { useEffect, useRef, useState } from "react"

interface Point {
  x: number
  y: number
  w: number
  h: number
  fill: string
  // Animation properties
  phase: number
  speed: number
}

export function GlimmeringMapBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [viewBox, setViewBox] = useState({ w: 800, h: 600 }) // Default fallback

  // 1. Load and Parse SVG Data (Once)
  useEffect(() => {
    async function loadAndParseSVG() {
      try {
        const response = await fetch("/map-dark.svg")
        const text = await response.text()
        
        // Parse the SVG text into a DOM structure we can query
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, "image/svg+xml")
        const svg = doc.querySelector("svg")
        
        if (!svg) return

        // Extract viewBox to ensure we scale the canvas correctly
        const vb = svg.getAttribute("viewBox")?.split(" ").map(Number)
        if (vb && vb.length === 4) {
          setViewBox({ w: vb[2], h: vb[3] })
        }

        // Extract all rects (dots) and prepare them for canvas rendering
        const rects = Array.from(doc.querySelectorAll("rect"))
        const parsedPoints: Point[] = rects.map((rect) => ({
          x: parseFloat(rect.getAttribute("x") || "0"),
          y: parseFloat(rect.getAttribute("y") || "0"),
          w: parseFloat(rect.getAttribute("width") || "0"),
          h: parseFloat(rect.getAttribute("height") || "0"),
          fill: rect.getAttribute("fill") || "#FFFFFF", // Default to white if no fill
          // Assign random animation properties upfront
          phase: Math.random() * Math.PI * 2,
          speed: 0.002 + Math.random() * 0.003, // Roughly matches your 0.5s-2s duration
        }))

        setPoints(parsedPoints)
      } catch (error) {
        console.error("Failed to load map data:", error)
      }
    }

    loadAndParseSVG()
  }, [])

  // 2. Animate Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    
    // Set internal resolution to match SVG viewBox for crisp rendering
    canvas.width = viewBox.w
    canvas.height = viewBox.h

    const render = (time: number) => {
      // Clear the previous frame
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      points.forEach((p) => {
        // Calculate glimmer opacity using sine wave
        // Matches your keyframes: 10% to 100% opacity
        const opacity = 0.1 + (Math.sin(time * p.speed + p.phase) + 1) / 2 * 0.9
        
        ctx.globalAlpha = opacity
        ctx.fillStyle = p.fill
        ctx.fillRect(p.x, p.y, p.w, p.h)
      })

      animationId = requestAnimationFrame(render)
    }

    render(0)

    return () => cancelAnimationFrame(animationId)
  }, [points, viewBox])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0f14]">
      {/* 1. Base gradient - deep twilight theme */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, 
            #0a0f14 0%, 
            #121d27 25%, 
            #1a2a3a 50%, 
            #162430 75%, 
            #0d1318 100%
          )`
        }}
      />

      {/* 2. Subtle radial glow from center */}
      <div 
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 100% 80% at 50% 30%, 
            rgba(212, 175, 55, 0.03) 0%, 
            transparent 50%
          )`
        }}
      />

      {/* 3. The Optimized Canvas Map */}
      <div className="absolute inset-0 flex items-center justify-center opacity-50">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          style={{
            // Keep your original 0.9 scale preference
            transform: "scale(0.9)", 
          }}
        />
      </div>

      {/* 4. Golden accent glow overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 40%, 
            rgba(212, 175, 55, 0.04) 0%, 
            transparent 70%
          )`
        }}
      />

      {/* 5. Vignette effect */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 50%, 
            transparent 0%, 
            rgba(10, 15, 20, 0.4) 70%,
            rgba(10, 15, 20, 0.8) 100%
          )`
        }}
      />

      {/* 6. Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  )
}