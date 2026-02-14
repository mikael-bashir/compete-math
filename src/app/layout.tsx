import type React from "react"
import type { Metadata } from "next"
import { Space_Grotesk, DM_Sans } from "next/font/google"
import "@shohojdhara/atomix/css"
import "./globals.css" // Global styles
// import "@shohojdhara/atomix/src/styles/index.scss";
// import "@shohojdhara/atomix/dist/index.css"
import Navbar from "./lib/components/navigation/navbar"
import { UserDisplayer2 } from "./lib/components/navigation/navstrip"
import Footer from "./lib/components/navigation/footer"
import SessionProviderWrapper from "./lib/components/auth/session-provider-wrapper"
import { Toaster } from "@/components/ui/sonner"
import { Suspense } from "react"
import { Analytics } from "@vercel/analytics/next"
import "katex/dist/katex.min.css"
// import Metadata  from "next";

// --- CRITICAL SEO METADATA FIX ---
export const metadata: Metadata = {
  metadataBase: new URL('https://competemath.com'),

  // 2. Clear Title & Description
  title: {
    default: "CompeteMath - Discover the Beauty of Math",
    template: "%s | CompeteMath", // e.g., "Problem #42 | CompeteMath"
  },
  description: "Try to find the key insights in weekly problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted math competitions.",
  
  // 3. Open Graph (Social Cards)
  openGraph: {
    title: "CompeteMath",
    description: "Discover the Beauty of Math",
    url: 'https://competemath.com',
    siteName: 'CompeteMath',
    locale: 'en_GB',
    type: 'website',
  }
}


const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
})

// Metadata for the page, available globally
// export const metadata: Metadata = {
//   title: "Compete Math - Frontier of Mathematics",
//   description: "Community-driven mathematical competitions",
// }

// RootLayout component, wrapping all pages and ensuring global components are loaded
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CompeteMath',          // <--- THIS IS WHAT GOOGLE WILL SHOW
    alternateName: ['competemath.com'], // Variations
    url: 'https://competemath.com',
  }

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body className={`antialiased bg-background text-foreground font-sans`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <Suspense fallback={<div>Loading...</div>}>
          <SessionProviderWrapper>
            {/* Fixed canvas container matching test.tsx structure */}
            <div className="fixed w-screen h-screen pointer-events-none">
              {/* Background layer - sibling to AtomixGlass */}
              <div className="absolute inset-0">
                <div className="w-full h-full bg-gradient-to-br from-slate-950 via-emerald-950/20 to-slate-900" />
              </div>

              {/* Navigation with AtomixGlass - as sibling to background */}
              <UserDisplayer2 />
            </div>

            {/* Main scrollable content */}
            <div className="relative min-h-screen">
              <div className="overflow-hidden">{children}</div>

              {/* Notification toaster */}
              <Toaster position="top-right" closeButton/>

              <Footer />

              {/* Vercel Analytics */}
              <Analytics />
            </div>
          </SessionProviderWrapper>
        </Suspense>
      </body>
    </html>
  )
}
