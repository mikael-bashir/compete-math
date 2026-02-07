'use client'

import React, { useMemo, useState, useEffect, useRef, memo } from 'react';

// --- MATH UTILS ---
const PHI = (1 + Math.sqrt(5)) / 2; 
const add = (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y });
const sub = (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y });
const scale = (v, s) => ({ x: v.x * s, y: v.y * s });
const interp = (v1, v2) => add(v1, scale(sub(v2, v1), 1 / PHI)); 

// --- MOCK DATA ---
const problemsData = Array.from({ length: 150 }, (_, i) => ({
  id: i + 1,
  title: `Problem ${i + 1}`,
  status: i < 18 ? "solved" : "locked",
  difficulty: ["Easy", "Medium", "Hard"][i % 3],
}));

// --- RESPONSIVE HOOK ---
function useWindowSize() {
  const [windowSize, setWindowSize] = useState({ width: 1600, height: 1000 });
  useEffect(() => {
    function handleResize() { setWindowSize({ width: window.innerWidth, height: window.innerHeight }); }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowSize;
}

// --- OPTIMIZED TILE COMPONENT ---
const Tile = memo(({ tile, problem, isHovered, onHover, onLeave }) => {
    const isSolved = problem.status === "solved";

    return (
        <g 
            onClick={(e) => { e.stopPropagation(); console.log('Open', problem.title); }}
            onMouseEnter={() => onHover(tile.id)}
            onMouseLeave={onLeave}
            className="cursor-pointer"
            style={{ willChange: 'transform, opacity' }} 
        >
            <polygon
                points={tile.fillPath}
                fill={isSolved ? "#fff" : "#161616"}
                fillOpacity={isSolved ? 0.05 : 0.96}
                stroke="none" 
                style={{
                    transition: "fill-opacity 0.2s ease",
                    ...(isHovered && { fill: "#fbbf24", fillOpacity: 0.6, filter: "url(#glow)" })
                }}
            />
            <polyline
                points={tile.strokePath}
                fill="none"
                stroke={isSolved ? "rgba(255,255,255,0.1)" : "#333"}
                strokeWidth={isSolved ? 0.5 : 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                    transition: "stroke 0.2s ease",
                    ...(isHovered && { stroke: "#fff", strokeWidth: 2 })
                }}
            />
            <text
                x={tile.cx} y={tile.cy}
                textAnchor="middle" dominantBaseline="middle"
                className="text-[10px] font-mono pointer-events-none select-none"
                style={{ 
                    fill: isHovered ? "black" : (isSolved ? "transparent" : "rgba(255,255,255,0.25)"),
                    fontSize: tile.type === 'THIN' ? '8px' : '10px',
                    fontWeight: 'normal',
                    transition: "fill 0.2s ease"
                }}
            >
                {problem.id}
            </text>
        </g>
    );
});

export default function PenroseArchives() {
  const [hoveredId, setHoveredId] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { width, height } = useWindowSize();

  // --- PAN & ZOOM STATE ---
  // Initial scale calculated to "Cover" the screen with tiles
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.6 }); 
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => setMounted(true), []);

  // --- GEOMETRY GENERATION ---
  const tiles = useMemo(() => {
    let triangles = [];
    const BASE = 5;
    const R = 3500; // Large radius for deep zooming

    for (let i = 0; i < BASE * 2; i++) {
        const a1 = (2 * i - 1) * Math.PI / (BASE * 2);
        const a2 = (2 * i + 1) * Math.PI / (BASE * 2);
        let v2 = { x: R * Math.cos(a1), y: R * Math.sin(a1) };
        let v3 = { x: R * Math.cos(a2), y: R * Math.sin(a2) };
        const v1 = { x: 0, y: 0 }; 
        if (i % 2 === 0) [v2, v3] = [v3, v2]; 
        triangles.push({ type: 'THIN', v1, v2, v3 });
    }

    for (let i = 0; i < 6; i++) {
        let next = [];
        triangles.forEach(t => {
            const { v1, v2, v3 } = t;
            if (t.type === 'THIN') {
                const p1 = interp(v1, v2);
                next.push({ type: 'THIN', v1: v3, v2: p1, v3: v2 });
                next.push({ type: 'THICK', v1: p1, v2: v3, v3: v1 });
            } else {
                const p2 = interp(v2, v1);
                const p3 = interp(v2, v3);
                next.push({ type: 'THICK', v1: p3, v2: v3, v3: v1 });
                next.push({ type: 'THICK', v1: p2, v2: p3, v3: v2 });
                next.push({ type: 'THIN', v1: p3, v2: p2, v3: v1 });
            }
        });
        triangles = next;
    }

    return triangles.map((t, i) => {
        const cx = (t.v1.x + t.v2.x + t.v3.x) / 3;
        const cy = (t.v1.y + t.v2.y + t.v3.y) / 3;
        return {
            id: i,
            fillPath: `${t.v1.x.toFixed(1)},${t.v1.y.toFixed(1)} ${t.v2.x.toFixed(1)},${t.v2.y.toFixed(1)} ${t.v3.x.toFixed(1)},${t.v3.y.toFixed(1)}`,
            strokePath: `${t.v2.x.toFixed(1)},${t.v2.y.toFixed(1)} ${t.v1.x.toFixed(1)},${t.v1.y.toFixed(1)} ${t.v3.x.toFixed(1)},${t.v3.y.toFixed(1)}`,
            cx, cy, type: t.type
        };
    });
  }, []);

  // --- INTERACTION HANDLERS (Robust) ---
  const handleWheel = (e) => {
    e.preventDefault();
    const ZOOM_SPEED = 0.001;
    // Clamp zoom: Min 0.4 (Overview), Max 3 (Detail)
    // Adjust Min (0.4) if you want to allow zooming out further/less
    const newScale = Math.min(Math.max(transform.scale - e.deltaY * ZOOM_SPEED, 0.4), 3);
    setTransform(prev => ({ ...prev, scale: newScale }));
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    
    // Panning Bounds Check:
    // Don't allow panning more than +/- 1500px from center
    const LIMIT = 1500 * transform.scale; 
    
    setTransform(prev => ({ 
        ...prev, 
        x: Math.max(Math.min(prev.x + dx, LIMIT), -LIMIT), 
        y: Math.max(Math.min(prev.y + dy, LIMIT), -LIMIT) 
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- VIEWPORT CALCS ---
  // We set a massive "virtual" viewport so the SVG isn't cropped by the window size.
  // This allows the transform to show tiles that are technically "off screen" initially.
  const V_W = 4000;
  const V_H = 4000;
  const V_X = -V_W / 2; 
  const V_Y = -V_H / 2; 

  if (!mounted) return <div className="bg-neutral-950 min-h-screen" />;

  return (
    <div className="relative min-h-screen bg-neutral-950 overflow-hidden text-gray-100 font-sans selection:bg-amber-500/30">
      
      {/* 1. BACKGROUND ART */}
      <div className="fixed inset-0 z-0 bg-[#1a1a1a]">
         {!imgError && (
             <img 
                src="/images/backgrounds/knight.jpeg" 
                alt="Art" 
                className="w-full h-full object-cover opacity-50 grayscale-[20%]"
                onError={() => setImgError(true)} 
             />
         )}
         <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* 2. UI HEADER */}
      <div className="absolute top-0 left-0 w-full z-20 flex justify-between items-center p-8 pointer-events-none">
            <h1 className="text-5xl font-bold text-amber-500 tracking-tighter drop-shadow-2xl">
                THE ARCHIVES
            </h1>
            <div className="pointer-events-auto bg-black/40 backdrop-blur-lg border border-white/10 px-6 py-3 rounded-full flex gap-3 items-center shadow-xl hover:bg-black/60 transition-all">
                 <span className="text-gray-400 text-sm">🔍</span>
                 <input type="text" placeholder="Search problems..." className="bg-transparent outline-hidden text-white placeholder-gray-500 w-48 text-sm" />
            </div>
      </div>

      {/* 3. INTERACTIVE CONTAINER */}
      <div 
        className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg 
            className="w-full h-screen"
            // Fixed massive viewport, camera moved via transform
            viewBox={`${V_X} ${V_Y} ${V_W} ${V_H}`}
            preserveAspectRatio="xMidYMid slice"
            style={{ 
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
        >
            <defs>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>

            {tiles.map((tile, i) => (
                <Tile 
                    key={tile.id}
                    tile={tile}
                    problem={problemsData[i % problemsData.length]}
                    isHovered={hoveredId === tile.id}
                    onHover={setHoveredId}
                    onLeave={() => setHoveredId(null)}
                />
            ))}
        </svg>
      </div>

      {/* 4. HOVER TOOLTIP */}
      {hoveredId !== null && (
         <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="bg-neutral-900/90 backdrop-blur-md border border-amber-500/40 p-4 rounded-xl shadow-2xl flex flex-col items-center min-w-[200px] animate-in fade-in slide-in-from-bottom-4">
                <span className="text-[10px] text-amber-500 font-mono uppercase tracking-widest mb-1">
                    {problemsData[hoveredId % problemsData.length].difficulty} Clearance
                </span>
                <span className="text-white font-bold text-center">
                    {problemsData[hoveredId % problemsData.length].title}
                </span>
            </div>
         </div>
      )}
    </div>
  );
}