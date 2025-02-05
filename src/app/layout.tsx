// app/layout.tsx
import type { Metadata } from "next";
// import { inria } from '@/app/fonts'; // Assuming you've set up custom fonts
import "./globals.css"; // Global styles
import Navbar from "./lib/components/navigation/navbar";
import UserDisplayer from "./lib/components/navigation/navstrip";
// import Footer from "./components/Footer"; // Your global Footer
import SessionProviderWrapper from "./lib/components/session-provider-wrapper";
import { Toaster } from 'react-hot-toast'; // Toaster for notifications
// import { Analytics } from "@vercel/analytics/react"; // For analytics

// Metadata for the page, available globally
export const metadata: Metadata = {
  title: "London Student Network",
  description: "For the students, by the students",
};

// RootLayout component, wrapping all pages and ensuring global components are loaded
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased text-white`}>
        <SessionProviderWrapper>
          {/* Header will appear on all pages */}
          <UserDisplayer />
          <Navbar />

          {/* The children will be injected here (page-specific content) */}
          <div className="overflow-hidden">
            {children}
          </div>

          {/* Notification toaster */}
          <Toaster position="top-right" />

          {/* Footer will appear on all pages */}
          {/* <Footer /> */}

          {/* Vercel Analytics */}
          {/* <Analytics /> */}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
