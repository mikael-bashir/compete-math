"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X, BookOpen, Archive, Users, Newspaper, Home } from "lucide-react"

export default function Navbar() {
  const [isMenuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/about", label: "About", icon: BookOpen },
    { href: "/archives", label: "Archives", icon: Archive },
    { href: "/global", label: "Global", icon: Users },
    { href: "/news", label: "News", icon: Newspaper },
  ]

  return (
    <header className="relative bg-white/90 backdrop-blur-md border-b border-emerald-100/50 shadow-sm">
      <div className="flex justify-center">
        {/* Desktop Navigation */}
        <nav className="w-full max-w-7xl px-6 py-3 hidden md:block">
          <ul className="flex justify-center items-center space-x-8">
            {navItems.map((item) => {
              const IconComponent = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg text-emerald-800 hover:text-emerald-600 hover:bg-emerald-50/80 transition-all duration-200 font-medium group"
                  >
                    <IconComponent className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Mobile Navigation Toggle */}
        <div className="md:hidden absolute top-4 right-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!isMenuOpen)}
            className="text-emerald-700 hover:bg-emerald-50"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Side Navigation */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white/95 backdrop-blur-lg shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        } md:hidden border-l border-emerald-100`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <h2 className="font-heading text-lg font-bold text-emerald-900">Navigation</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMenuOpen(false)}
              className="text-emerald-700 hover:bg-emerald-50"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <ul className="space-y-2">
            {navItems.map((item) => {
              const IconComponent = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center space-x-3 px-4 py-3 rounded-lg text-emerald-800 hover:text-emerald-600 hover:bg-emerald-50/80 transition-all duration-200 font-medium group w-full"
                  >
                    <IconComponent className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-8 pt-6 border-t border-emerald-100">
            <div className="space-y-3">
              <Link href="/auth/login" onClick={() => setMenuOpen(false)}>
                <Button
                  variant="outline"
                  className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-transparent"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/register" onClick={() => setMenuOpen(false)}>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden" onClick={() => setMenuOpen(false)} />
      )}
    </header>
  )
}
