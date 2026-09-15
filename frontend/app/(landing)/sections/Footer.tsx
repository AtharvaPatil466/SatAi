"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ArrowUp } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

export default function Footer() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".footer-cta",
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "expo.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 90%" },
        }
      );
      gsap.fromTo(
        ".footer-link",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "expo.out",
          stagger: 0.05,
          scrollTrigger: { trigger: ".footer-content", start: "top 90%" },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <footer ref={sectionRef} id="bts" className="bg-black text-white py-24 lg:py-32">
      <div className="px-6 lg:px-14">
        {/* CTA */}
        <div className="footer-cta mb-20">
          <p className="text-lg lg:text-xl text-white/40 mb-4">
            Geospatial intelligence, offline. Open source. Auditable.
          </p>
          <a
            href="/workspace"
            className="inline-flex items-center gap-3 text-4xl lg:text-6xl font-black hover:text-cyan-400 transition-colors group"
          >
            Open App
            <ArrowRight className="w-8 h-8 lg:w-12 lg:h-12 group-hover:translate-x-2 transition-transform" />
          </a>
        </div>

        {/* Grid */}
        <div className="footer-content grid grid-cols-1 md:grid-cols-3 gap-12 pt-12 border-t border-white/10">
          <div>
            <p className="footer-link text-white/40 text-xs uppercase tracking-wider mb-4 font-medium">
              Navigate
            </p>
            <nav className="flex flex-col gap-3">
              {["#work", "#services", "#about"].map((href, i) => {
                const labels = ["Capabilities", "Services", "About"];
                return (
                  <button
                    key={href}
                    onClick={() => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" })}
                    className="footer-link text-left text-white/60 hover:text-white transition-colors text-sm"
                  >
                    {labels[i]}
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            <p className="footer-link text-white/40 text-xs uppercase tracking-wider mb-4 font-medium">
              Evaluation
            </p>
            <div className="footer-link space-y-2 text-sm text-white/60">
              <p>RSVQA-LR full split</p>
              <p>Resolution ladder (5 rungs)</p>
              <p>SAR dual-pol gate</p>
              <p>Hash-chained audit traces</p>
            </div>
          </div>

          <div>
            <p className="footer-link text-white/40 text-xs uppercase tracking-wider mb-4 font-medium">
              Stack
            </p>
            <div className="footer-link space-y-2 text-sm text-white/60">
              <p>Qwen2.5-VL-3B-Instruct</p>
              <p>FastAPI · Next.js</p>
              <p>GSAP ScrollTrigger</p>
              <p>LoveDA · RSVQA-LR</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mt-20 pt-8 border-t border-white/10">
          <p className="text-white/30 text-xs mb-4 md:mb-0 font-mono">
            © SIH 2026 — sohamsssssssssssssssss
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 text-white/40 hover:text-white text-sm transition-colors"
          >
            <span>Back to Top</span>
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </footer>
  );
}
