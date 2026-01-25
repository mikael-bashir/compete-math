"use client"

import Link from "next/link";
import { MessageCircle } from "lucide-react"; 
import { SiGithub, SiX } from "react-icons/si";
import { useThemeStore } from "../../(store)/use-theme-store";

export default function Footer() {
  // 1. Hook into the global theme store
  const theme = useThemeStore((state) => state.theme);

  const iconClasses = "w-5 h-5 opacity-70 hover:opacity-100 transition-opacity duration-200";

  return (
    <footer 
      className="py-16 md:py-24 font-serif transition-colors duration-700 ease-in-out"
      style={{
        // Dynamic Gradient: Fades from black (bottom) up to the theme color
        background: `linear-gradient(to top, black, ${theme.backgroundColor})`,
        color: theme.textColor,
        borderTop: `1px solid ${theme.borderColor}`
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        
        {/* --- Glass Link Panels --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          
          {/* We define panels as data to avoid repeating the style logic 4 times */}
          {[
            { 
              title: "CompeteMath", 
              links: [
                { label: "About Us", href: "/about" },
                { label: "Careers", href: "/careers" },
                { label: "Press", href: "/press" }
              ] 
            },
            { 
              title: "Legal", 
              links: [
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
                { label: "Cookie Policy", href: "/cookies" }
              ] 
            },
            { 
              title: "Community", 
              links: [
                { label: "FAQ", href: "/faq" },
                { label: "Leaderboards", href: "/leaderboard" },
                { label: "Contribute (Lean4)", href: "/contribute" }
              ] 
            },
            { 
              title: "Connect", 
              type: "social" 
            }
          ].map((panel, idx) => (
            <div 
              key={idx} 
              className="p-6 rounded-2xl backdrop-blur-lg transition-colors duration-700"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.03)", // Subtle consistent glass
                borderColor: theme.borderColor,
                borderWidth: "1px"
              }}
            >
              <h3 className="text-sm font-semibold mb-4 text-white">
                {panel.title}
              </h3>
              
              {panel.type === 'social' ? (
                <div className="flex space-x-5">
                   <Link href="#" aria-label="Github"><SiGithub className={iconClasses} /></Link>
                   <Link href="#" aria-label="X"><SiX className={iconClasses} /></Link>
                   <Link href="#" aria-label="Forum"><MessageCircle className={iconClasses} /></Link>
                </div>
              ) : (
                <ul className="space-y-3 text-xs">
                  {panel.links?.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="hover:text-white transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          
        </div>

        {/* --- Bottom Line --- */}
        <div 
          className="mt-16 pt-8 text-center transition-colors duration-700"
          style={{ borderTop: `1px solid ${theme.borderColor}` }}
        >
          <p className="text-xs opacity-50">
            © {new Date().getFullYear()} CompeteMath. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}