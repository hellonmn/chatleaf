import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Chatleaf Brand Guide — Ink + Ocean system.
        // `brand` is the single accent (ocean) used across the app.
        brand: {
          DEFAULT: "#0e7490", // Ocean
          dark: "#0b5a72", // Ocean Deep
          ink: "#083f50", // Ocean Ink
          soft: "#e1eff4", // Ocean Soft
          mid: "#2bb3e0", // Ocean Mid
          light: "#7fcfe6", // Ocean Light
        },
        ocean: {
          DEFAULT: "#0e7490",
          soft: "#e1eff4",
          deep: "#0b5a72",
          ink: "#083f50",
          mid: "#2bb3e0",
          light: "#7fcfe6",
        },
        ink: "#1c1f2a",
        sub: "#5f6b7a",
        faint: "#97a1b0",
        line: "#e6ebf0",
        surface: "#f5f8fa",
        canvas: "#eef2f6",
        warm: "#f3a05a", // sand · alerts
        sky: "#56a8d8", // info
        violet: "#8366d6", // automations
        rose: "#e0698a",
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        card: "18px", // panels, cards, modals
        btn: "13px", // buttons, inputs
        pill: "20px", // status, tags
      },
      boxShadow: {
        card: "0 6px 24px rgba(14,116,144,.07)", // ocean-tinted, never black
        "card-lg": "0 14px 40px rgba(14,116,144,.13)",
      },
    },
  },
  plugins: [],
} satisfies Config;
