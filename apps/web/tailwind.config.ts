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
        brand: {
          DEFAULT: "#25D366", // WhatsApp green
          dark: "#128C7E",
          ink: "#075E54",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
