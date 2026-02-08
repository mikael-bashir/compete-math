import type React from "react"
// import type Metadata from "next"
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
// import { Analytics } from "@vercel/analytics/react"; // For analytics
import { Analytics } from "@vercel/analytics/next"
import "katex/dist/katex.min.css"
// import Metadata  from "next";

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
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body className={`antialiased bg-background text-foreground font-sans`}>
        <Suspense fallback={<div>Loading...</div>}>
          <SessionProviderWrapper>
            <UserDisplayer2 />
            {/* <Navbar /> */}
            <div className="overflow-hidden">{children}</div>

            {/* Notification toaster */}
            <Toaster position="top-right" closeButton/>

            <Footer />

            {/* Vercel Analytics */}
            {/* <Analytics /> */}
          </SessionProviderWrapper>
        </Suspense>
      </body>
    </html>
  )
}
