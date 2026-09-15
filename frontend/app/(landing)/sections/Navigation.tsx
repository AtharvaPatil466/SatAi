"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "WORK", href: "#work", num: "1" },
  { label: "SERVICES", href: "#services", num: "2" },
  { label: "ABOUT", href: "#about", num: "3" },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 100);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) element.scrollIntoView({ behavior: "smooth" });
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="flex items-center justify-between px-6 lg:px-10 py-5">
          <a
            href="#"
            className={`text-lg font-bold tracking-tight transition-all ${isScrolled ? "text-black" : "text-white"}`}
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          >
            SATQUERY
          </a>

          <div className="hidden lg:flex items-center gap-10">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => scrollToSection(item.href)}
                className={`group flex items-baseline gap-1 text-sm font-medium transition-colors ${
                  isScrolled ? "text-black hover:text-gray-500" : "text-white/90 hover:text-white"
                }`}
              >
                <span className={`text-xs ${isScrolled ? "text-gray-400" : "text-white/40"}`}>{item.num}</span>
                <span className="link-underline-landing">{item.label}</span>
              </button>
            ))}
          </div>

          <a
            href="/workspace"
            className={`hidden lg:block text-sm font-semibold px-4 py-2 rounded transition-all duration-300 ${
              isScrolled
                ? "bg-black text-white hover:bg-gray-800"
                : "bg-white text-black hover:bg-white/90"
            }`}
          >
            OPEN APP →
          </a>

          <button
            className="lg:hidden p-2 -mr-2 text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div
        className={`fixed inset-0 z-40 bg-white transition-transform duration-500 ease-in-out lg:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col items-start justify-center h-full px-10 gap-8">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => scrollToSection(item.href)}
              className="flex items-baseline gap-3 text-4xl font-bold text-black"
            >
              <span className="text-lg text-gray-400">{item.num}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <a
            href="/workspace"
            className="mt-6 text-2xl font-semibold bg-black text-white px-6 py-3 rounded"
          >
            OPEN APP →
          </a>
        </div>
      </div>
    </>
  );
}
