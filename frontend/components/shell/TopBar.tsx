import { ShieldCheck } from "lucide-react";

export function TopBar() {
  return (
    <header className="hidden h-16 items-center justify-between bg-onyx px-8 backdrop-blur lg:flex">
      <p className="text-xs uppercase tracking-[0.16em] text-ash" style={{ fontWeight: 480 }}>Evidence-backed geospatial intelligence</p>
      <div className="flex items-center gap-2 rounded-pill bg-graphite px-4 py-1.5 text-xs text-ivory" style={{ fontWeight: 480 }}><ShieldCheck size={14} className="text-ash" /> AUDITABLE</div>
    </header>
  );
}
