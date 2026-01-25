import { create } from 'zustand'

// 1. Define the Shape of your State
type FooterTheme = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

type ThemeState = {
  theme: FooterTheme;
  // Actions
  setTheme: (theme: FooterTheme) => void;
  resetTheme: () => void;
}

// 2. Define Default Values
const defaultTheme: FooterTheme = {
  backgroundColor: "#000000",
  borderColor: "rgba(255, 255, 255, 0.1)",
  textColor: "#9ca3af"
}

// 3. Create the Hook
export const useThemeStore = create<ThemeState>((set) => ({
  theme: defaultTheme,

  // Action: Merge new theme settings
  setTheme: (newTheme) => set({ theme: newTheme }),

  // Action: Reset to defaults
  resetTheme: () => set({ theme: defaultTheme }),
}))