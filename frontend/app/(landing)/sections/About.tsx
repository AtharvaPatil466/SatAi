"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const stats = [
  { label: "open_accuracy baseline", value: "0.165" },
  { label: "Binary accuracy", value: "0.667" },
  { label: "Test questions", value: "10K+" },
  { label: "GSD rungs evaluated", value: "5" },
];

export default function About() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".about-content",
        { opacity: 0, y: 60 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "expo.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
        }
      );
      gsap.fromTo(
        ".stat-item",
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "expo.out",
          stagger: 0.1,
          scrollTrigger: { trigger: ".stats-grid", start: "top 85%" },
        }
      );
      // Image parallax
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top bottom",
        end: "bottom top",
        scrub: 1,
        onUpdate: (self) => {
          gsap.set(".about-bg", { y: self.progress * -80 });
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="about" className="py-24 lg:py-36 bg-black text-white overflow-hidden">
      <div className="px-6 lg:px-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          {/* Left - animated dark panel */}
          <div className="relative">
            <div className="about-bg aspect-[4/5] overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,237,215,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,237,215,0.08) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              {/* Stat cards floating */}
              <div className="stats-grid absolute inset-0 flex flex-col justify-center gap-4 p-8">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="stat-item bg-white/5 border border-white/10 rounded-lg p-4 backdrop-blur-sm"
                  >
                    <p className="text-3xl lg:text-4xl font-black text-cyan-400 mb-1">{stat.value}</p>
                    <p className="text-xs text-white/50 uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right - content */}
          <div className="about-content">
            <p className="text-xs text-gray-500 uppercase tracking-[0.3em] mb-4 font-medium">ABOUT</p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black uppercase leading-none mb-8">
              THE PROJECT
            </h2>
            <p className="text-3xl lg:text-4xl font-light leading-tight mb-8 text-white/80">
              NOT A DEMO.<br />
              A MEASUREMENT.
            </p>
            <p className="text-white/50 text-lg leading-relaxed mb-8 max-w-md">
              SIH 2026 — a multi-agent geospatial VQA system on Qwen2.5-VL-3B with hash-chained audit traces,
              resolution degradation studies, and offline-first inference.
            </p>
            <a
              href="/workspace"
              className="inline-flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-white transition-colors group"
            >
              RUN THE APP
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
