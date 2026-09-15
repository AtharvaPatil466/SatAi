"use client";

import { Activity, AlertCircle, Aperture, History, Radar, Satellite, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/workspace", label: "Workspace", icon: Aperture },
  { href: "/change", label: "Change", icon: AlertCircle },
  { href: "/resolution", label: "Resolution Lab", icon: Activity },
  { href: "/sar", label: "Multi-Sensor", icon: Radar },
  { href: "/executions", label: "Executions", icon: History },
  { href: "/system", label: "System", icon: Settings2 },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-border bg-[#08131d]/95 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="flex h-14 items-center gap-3 px-4 lg:h-[72px] lg:px-5">
        <div className="grid size-9 place-items-center rounded border border-accent/35 bg-accent/[0.07] text-accent"><Satellite size={18} /></div>
        <div><p className="text-[13px] font-black tracking-[0.13em] text-white">SATQUERY AI</p><p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Geospatial intelligence</p></div>
      </div>
      <nav aria-label="Primary navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-4 lg:pb-0">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={cn("flex shrink-0 items-center gap-3 rounded px-3 py-2 text-[13px] transition focus:outline-none focus:ring-2 focus:ring-accent", active ? "border border-accent/25 bg-accent/[0.08] text-accent" : "border border-transparent text-slate-400 hover:bg-raised hover:text-slate-100") }>
              <Icon size={16} /><span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="absolute bottom-0 hidden w-[216px] border-t border-border p-4 lg:block">
        <p className="eyebrow">Runtime posture</p>
        <div className="mt-2 text-xs text-slate-300">Offline-first</div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">Runtime facts and capability readiness are reported in System.</p>
      </div>
    </aside>
  );
}
