import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Vivid+Co — prismatic light through obsidian. Monochrome bone-on-void;
        // the only chromatic voice is the prism artifact (never on UI chrome).
        background: "#101010", // obsidian canvas
        surface: "#495764", // graphite veil — content surface
        raised: "#202027", // subtle lift above the void
        border: "#403f3f", // ash hairline
        accent: "#fffdf9", // bone white — Vivid has no separate accent color

        // Named Vivid tokens
        obsidian: "#101010",
        bone: "#fffdf9",
        graphite: "#495764",
        ash: "#403f3f",
        fog: "#6f879c", // muted secondary text
        // Prism channels — used ONLY inside the brand artifact, never UI.
        "prism-red": "#ff2a2a",
        "prism-cyan": "#2a7fff",
        "prism-lime": "#2aff2a",

        // Functional status — kept muted; system stays monochrome otherwise.
        success: "#9ab487",
        warning: "#d9a05f",
        error: "#db8278",
      },
      boxShadow: {
        // Flat by design — no elevation anywhere.
        panel: "none",
        glow: "none",
      },
      borderRadius: {
        cards: "15px",
        nav: "5px",
      },
      fontFamily: {
        // Neue Montreal (exclusive typeface) → Inter substitute.
        sans: ["var(--font-neue)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-neue)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
