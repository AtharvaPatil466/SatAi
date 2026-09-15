"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const capabilities = [
  {
    id: 1,
    category: "Visual QA",
    title: "Scene Analysis",
    desc: "Frozen Qwen2.5-VL-3B inference over satellite imagery. Ask any question, get grounded evidence.",
    tag: "0.3 m GSD",
  },
  {
    id: 2,
    category: "Resolution",
    title: "Ladder Eval",
    desc: "5-rung degradation study: 0.3 → 10 m GSD on real LoveDA pixels with per-rung degeneracy guards.",
    tag: "RSVQA-LR",
  },
  {
    id: 3,
    category: "SAR Gate",
    title: "Dual-Pol Analysis",
    desc: "Sentinel-1 GRD HyP3 RTC processing with VV/VH false-color quicklooks for expert interpretation.",
    tag: "Sentinel-1",
  },
];

export default function Work() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".work-header",
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "expo.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
        }
      );
      gsap.fromTo(
        ".work-card",
        { opacity: 0, y: 70 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "expo.out",
          stagger: 0.15,
          scrollTrigger: { trigger: ".work-grid", start: "top 80%" },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="work" className="py-24 lg:py-36 bg-white">
      <div className="px-6 lg:px-14">
        <div className="work-header flex flex-col lg:flex-row lg:items-end lg:justify-between mb-16 lg:mb-20">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-[0.3em] mb-3 font-medium">
              AI · SATELLITE · EVIDENCE
            </p>
            <h2 className="text-[clamp(2.5rem,6vw,5rem)] font-black uppercase leading-none">
              CAPABILITIES
            </h2>
          </div>
          <a
            href="/workspace"
            className="mt-6 lg:mt-0 inline-flex items-center gap-2 text-sm font-bold link-underline-landing group text-gray-800"
          >
            OPEN WORKSPACE
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        <div className="work-grid grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {capabilities.map((cap) => (
            <a key={cap.id} href="/workspace" className="work-card group block">
              <div className="relative aspect-[4/3] overflow-hidden mb-5 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg">
                {/* Animated grid inside card */}
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(71,215,221,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(71,215,221,0.15) 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                  }}
                />
                <div className="absolute inset-0 flex flex-col justify-center items-center gap-2 p-6">
                  <span className="text-5xl font-black text-white/10 uppercase tracking-tighter">
                    {cap.category}
                  </span>
                  <span
                    className="text-xs font-bold tracking-[0.25em] uppercase px-3 py-1 rounded-full"
                    style={{ background: "rgba(71,215,221,0.15)", color: "#47d7dd" }}
                  >
                    {cap.tag}
                  </span>
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500 rounded-lg" />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-medium">
                  {cap.category}
                </p>
                <h3 className="text-xl font-bold mb-2 group-hover:opacity-70 transition-opacity">
                  {cap.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{cap.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
