import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

// SF Pro Display / SF Pro Text substitute. Variable font covers the Apple
// weight range (400 body → 600/700 headlines).
const arcadia = Inter({
  subsets: ["latin"],
  variable: "--font-arcadia",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SatQuery AI", template: "%s · SatQuery AI" },
  description: "Evidence-backed geospatial intelligence with explicit execution provenance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={arcadia.variable} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning><AppShell>{children}</AppShell></body>
    </html>
  );
}
