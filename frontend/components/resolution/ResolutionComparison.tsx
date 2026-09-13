"use client";

import { useState } from "react";
import { resolutionImageUrl } from "@/lib/api";
import type { ResolutionReport } from "@/lib/types";

export function ResolutionComparison({ report }: { report: ResolutionReport }) {
  const [selected, setSelected] = useState(1);
  const native = report.assets.find(asset => asset.gsd === 0.3);
  const target = report.assets.find(asset => asset.gsd === selected);
  return <section className="panel overflow-hidden">
    <div className="border-b border-border p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Evaluated input imagery</p><p className="mt-1 text-xs text-slate-400">Exact rung files only. Missing or checksum-mismatched imagery is never substituted.</p></div>
        <div className="flex flex-wrap gap-2" aria-label="Resolution rung selector">
          {report.assets.filter(asset => asset.gsd !== 0.3).map(asset => <button key={asset.gsd} type="button" aria-pressed={selected === asset.gsd} onClick={() => setSelected(asset.gsd)} className={`rounded border px-3 py-1.5 font-mono text-xs ${selected === asset.gsd ? "border-accent bg-accent/10 text-accent" : "border-border text-slate-400"}`}>{asset.gsd} m</button>)}
        </div>
      </div>
    </div>
    <div className="grid gap-px bg-border lg:grid-cols-2">
      <Rung title="Native reference" gsd={0.3} available={!!native?.available} reason={native?.unavailable_reason} />
      <Rung title="Selected degradation" gsd={selected} available={!!target?.available} reason={target?.unavailable_reason} />
    </div>
  </section>;
}

function Rung({ title, gsd, available, reason }: { title: string; gsd: number; available: boolean; reason?: string | null }) {
  return <article className="bg-surface p-4">
    <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-slate-300">{title}</p><span className="font-mono text-xs text-accent">{gsd} m GSD</span></div>
    <div className="grid min-h-72 place-items-center overflow-hidden rounded-lg border border-border bg-background">
      {available ? <img src={resolutionImageUrl(gsd)} alt={`${gsd} metre GSD evaluated LoveDA input`} className="max-h-[440px] w-full object-contain" /> : <div role="status" className="max-w-sm p-8 text-center text-sm text-warning"><p>VERIFIED ASSET UNAVAILABLE</p><p className="mt-2 text-xs leading-relaxed text-slate-500">{reason ?? "No validated image is available for this rung."}</p></div>}
    </div>
  </article>;
}
