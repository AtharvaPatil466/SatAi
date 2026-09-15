import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

// Neue Montreal substitute — Vivid+Co runs a single typeface at weight 400.
const neue = Inter({
  subsets: ["latin"],
  variable: "--font-neue",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SatQuery AI", template: "%s · SatQuery AI" },
  description: "Evidence-backed geospatial intelligence with explicit execution provenance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={neue.variable}>
      <body className="font-sans antialiased"><AppShell>{children}</AppShell></body>
    </html>
  );
}
