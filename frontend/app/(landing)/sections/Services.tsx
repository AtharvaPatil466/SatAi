"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const services = [
  "Geospatial VQA",
  "Resolution Analysis",
  "SAR Interpretation",
  "Evidence Provenance",
  "Audit Chain Verification",
  "Multi-model Routing",
];

export default function Services() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".services-header",
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
        ".service-item",
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: { trigger: ".services-list", start: "top 80%" },
        }
      );
      // Parallax scrolling background text
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top bottom",
        end: "bottom top",
        scrub: 1,
        onUpdate: (self) => {
          gsap.set(".services-bg-text", { x: self.progress * -250 });
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="services"
      className="relative py-24 lg:py-36 bg-white overflow-hidden"
    >
      {/* Parallax background text */}
      <div className="services-bg-text absolute top-1/2 -translate-y-1/2 left-0 text-[18vw] font-black text-gray-100 whitespace-nowrap pointer-events-none select-none uppercase tracking-tighter">
        SERVICES
      </div>

      <div className="relative z-10 px-6 lg:px-14">
        <div className="services-header mb-16 lg:mb-20 flex flex-col lg:flex-row lg:justify-between lg:items-start gap-8">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-[0.3em] mb-3 font-medium">OUR</p>
            <h2 className="text-[clamp(2.5rem,6vw,5rem)] font-black uppercase leading-none">
              SERVICES
            </h2>
          </div>
          <p className="lg:max-w-sm text-2xl lg:text-3xl font-light leading-tight text-gray-600">
            PRECISION ANALYSIS.<br />PROVABLE RESULTS.
          </p>
        </div>

        <div className="services-list">
          <p className="text-xs text-gray-400 uppercase tracking-[0.3em] mb-6 font-medium">
            WHAT WE DO
          </p>
          <div className="divide-y divide-gray-100">
            {services.map((service, index) => (
              <div
                key={service}
                className="service-item group flex items-center justify-between py-5 cursor-pointer hover:bg-gray-50 transition-colors -mx-6 px-6 lg:-mx-14 lg:px-14"
              >
                <span className="text-xl lg:text-3xl font-semibold group-hover:translate-x-2 transition-transform duration-300">
                  {service}
                </span>
                <span className="text-sm text-gray-400 font-mono">0{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
