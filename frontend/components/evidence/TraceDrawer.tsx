"use client";

import { useEffect, useState } from "react";
import { ArrowDown, CheckCircle2, X } from "lucide-react";
import type { TraceRecord, TraceVerification } from "@/lib/types";
import { IntegrityBadge, type IntegrityState } from "./IntegrityBadge";
import { formatTimestamp } from "@/lib/utils";

export function TraceDrawer({ trace, onVerify, verification, verifying = false, verificationError, artifact }: {
  artifact?: string | null;
  trace: TraceRecord;
  onVerify?: () => void;
  verification?: TraceVerification | null;
  verifying?: boolean;
  verificationError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const integrity: IntegrityState = verificationError ? "UNAVAILABLE" : verification ? verification.verified ? "VERIFIED" : "FAILED" : "UNCHECKED";
  const route = [
    ["Request", trace.input_summary.question],
    ["Planner", trace.params.planner_rule ? `${trace.params.planner_rule}${trace.params.planner_version ? ` · ${trace.params.planner_version}` : ""}` : "Not reported"],
    ["Capability", trace.params.capability ?? "Not reported"],
    ["Provider", trace.model_name || "Not reported"],
    ["Execution mode", trace.params.execution_mode],
    ["Trace", trace.record_hash],
  ];

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-1 rounded border border-border bg-raised/35 px-3 py-2.5 text-left text-xs font-semibold text-slate-200 transition hover:border-accent/45 hover:text-white">
      <span>View execution</span><span className="flex items-center gap-2"><IntegrityBadge state={integrity} /><ArrowDown size={13} className="-rotate-90" /></span>
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="execution-title" className="fixed inset-0 z-50 flex justify-end bg-black/55" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-[#08131c] shadow-2xl result-reveal">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-[#08131c]/95 p-5">
          <div><p className="eyebrow">Execution provenance</p><h2 id="execution-title" className="mt-2 text-lg font-semibold text-white">Audit record</h2></div>
          <button type="button" aria-label="Close execution details" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded border border-border text-slate-400 hover:text-white"><X size={15} /></button>
        </header>
        <div className="space-y-5 p-5">
          <ol aria-label="Execution route" className="space-y-0">
            {route.map(([label, value], index) => <li key={label} className="relative grid grid-cols-[18px_105px_minmax(0,1fr)] gap-2 pb-4 last:pb-0">
              <span className="relative z-10 mt-0.5 grid size-[18px] place-items-center rounded-full border border-accent/35 bg-[#08131c] font-mono text-[8px] text-accent">{index + 1}</span>
              {index < route.length - 1 && <span aria-hidden className="absolute bottom-0 left-[8px] top-[18px] w-px bg-border" />}
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</span>
              <span className="break-all font-mono text-[10px] leading-4 text-slate-300">{value}</span>
            </li>)}
          </ol>
          <section className="rounded border border-border bg-raised/30 p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Trace integrity</p><IntegrityBadge state={integrity} /></div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{verificationError ?? verification?.message ?? "Verification not performed."}</p>
            {onVerify && <button type="button" disabled={verifying} onClick={onVerify} className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-accent/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-accent disabled:opacity-50"><CheckCircle2 size={13} />{verifying ? "Verifying trace…" : "Verify trace"}</button>}
          </section>
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4">
            <Field label="Model version" value={trace.model_version || "Not reported"} />
            <Field label="Trace time" value={formatTimestamp(trace.timestamp_iso)} />
            {(artifact ?? trace.params.results_artifact) && <Field label="Cached artifact" value={(artifact ?? trace.params.results_artifact)!} wide />}
            <Field label="Previous hash" value={trace.prev_hash || "Genesis"} wide />
          </dl>
          <details className="border-t border-border pt-4"><summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Technical record</summary><pre className="mt-3 max-h-72 overflow-auto rounded bg-background p-3 font-mono text-[9px] leading-4 text-slate-500">{JSON.stringify(trace, null, 2)}</pre></details>
        </div>
      </section>
    </div>}
  </>;
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "col-span-2" : ""}><dt className="text-[9px] uppercase tracking-[0.12em] text-slate-600">{label}</dt><dd className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-300">{value}</dd></div>;
}
