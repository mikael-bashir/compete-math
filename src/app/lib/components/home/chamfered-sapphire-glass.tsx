"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { AtomixGlass } from "@shohojdhara/atomix"

interface ChamferedSapphireGlassProps {
  children: React.ReactNode
  className?: string
  chamferSize?: number // in pixels
  variant?: "default" | "strong" | "subtle"
}

export function ChamferedSapphireGlass({
  children,
  className,
  chamferSize = 4,
  variant = "default",
}: ChamferedSapphireGlassProps) {

  return (
    <div>
        <AtomixGlass 
            mode="standard"
            displacementScale={110}
            blurAmount={0.2}
            aberrationIntensity={0.2}
            cornerRadius={15}
            elasticity={0}
        >
            {children}
        </AtomixGlass>
    </div>
  )
}

// Simplified version for smaller elements
export function ChamferedSapphireGlassSm({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <ChamferedSapphireGlass className={cn("rounded-xl", className)} chamferSize={2} variant="subtle" children={children}/>
  )
}
