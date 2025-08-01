import type { Metadata } from "next";
import "./globals.css"; // Global styles
import Navbar from "./lib/components/navigation/navbar";
import UserDisplayer from "./lib/components/navigation/navstrip";
// import Footer from "./components/Footer"; // Your global Footer
import SessionProviderWrapper from "./lib/components/auth/session-provider-wrapper";
import { Toaster } from "@/components/ui/sonner";
// import { Analytics } from "@vercel/analytics/react"; // For analytics
import "katex/dist/katex.min.css";

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
          <UserDisplayer />
          <Navbar />

          <div className="overflow-hidden">
            {children}
          </div>

          {/* Notification toaster */}
          <Toaster position="top-right" />

          {/* <Footer /> */}

          {/* Vercel Analytics */}
          {/* <Analytics /> */}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
