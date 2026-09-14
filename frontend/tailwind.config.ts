import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Apple (light) — cathedral of white space. Existing semantic + legacy
        // token names are repointed to Apple values so the whole app flips.
        background: "#ffffff", // paper — primary page canvas
        surface: "#f5f5f7", // canvas gray — card surface / alternating band
        raised: "#e8e8ed", // cool wash — hover surface
        border: "#d6d6d6", // hairline — used sparingly
        accent: "#0071e3", // electric blue — filled CTA only

        // Apple named tokens
        ink: "#1d1d1f",
        deepgray: "#474747",
        midgray: "#707070",
        hairline: "#d6d6d6",
        canvas: "#f5f5f7",
        paper: "#ffffff",
        coolwash: "#e8e8ed",
        electric: "#0071e3",
        linkblue: "#0066cc",
        ember: "#b64400",

        // Legacy token names (from prior theme) repointed to Apple palette so
        // components referencing them render correctly on the light canvas.
        onyx: "#ffffff",
        graphite: "#f5f5f7",
        obsidian: "#e8e8ed",
        slateline: "#d6d6d6",
        mist: "#d6d6d6",
        ash: "#707070", // secondary text
        ivory: "#1d1d1f", // primary text (ink)
        cobalt: "#0071e3", // electric blue accent

        // Functional status — used only where a real signal is needed.
        success: "#2ca24d",
        warning: "#b64400",
        error: "#c0392b",

        // Cinematic-landing-only tokens (kept so the 3D intro's classes still
        // resolve; not used by the Apple app pages).
        "surface-elevated": "#080c17",
        primary: "#06b6d4",
        subtitle: "#94a3b8",
        secondary: "#94a3b8",
        tertiary: "#64748b",
        cyan: "#38bdf8",
      },
      boxShadow: {
        // Apple relies on canvas alternation + radii, never shadows.
        none: "none",
        panel: "none",
        glow: "none",
      },
      borderRadius: {
        cards: "28px",
        pill: "980px",
      },
      fontFamily: {
        // SF Pro Display / SF Pro Text → Inter substitute.
        sans: ["var(--font-arcadia)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-arcadia)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
