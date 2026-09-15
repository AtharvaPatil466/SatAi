import { Fingerprint } from "lucide-react";

export function TopBar() {
  return (
    <header className="hidden h-14 items-center justify-between border-b border-border bg-background/90 px-5 lg:flex">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Satellite data · Natural-language analysis</p>
      <div className="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><Fingerprint size={13} /> Traceable by design</div>
    </header>
  );
}
