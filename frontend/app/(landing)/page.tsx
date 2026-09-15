"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Navigation from "./sections/Navigation";
import Hero from "./sections/Hero";
import Work from "./sections/Work";
import Services from "./sections/Services";
import About from "./sections/About";
import Footer from "./sections/Footer";

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.refresh();
    }, mainRef);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, []);

  return (
    <div ref={mainRef} className="relative bg-white min-h-screen landing-page">
      <Navigation />
      <main>
        <Hero />
        <Work />
        <Services />
        <About />
        <Footer />
      </main>
    </div>
  );
}
