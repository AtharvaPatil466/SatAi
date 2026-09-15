import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        surface: "#f3f5f8",
        raised: "#edf1f6",
        border: "#dfe5ee",
        accent: "#245bdb",
        success: "#16713d",
        warning: "#855400",
        error: "#b42332",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(0, 0, 0, 0.22)",
        glow: "0 0 30px rgba(71, 215, 221, 0.12)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
