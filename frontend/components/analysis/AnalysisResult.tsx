import type { AnalysisResponse } from "@/lib/types";
import { ExecutionBadge } from "./ExecutionBadge";

export function AnalysisResult({ result }: { result: AnalysisResponse }) {
  return (
    <section className="rounded-xl border border-accent/25 bg-accent/[0.055] p-5 shadow-glow" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">Answer</p><ExecutionBadge mode={result.execution_mode} /></div>
      <p className="mt-5 break-words text-3xl font-bold text-white">{result.answer}</p>
      <p className="mt-4 break-words text-sm text-slate-300">{result.model.name} · {result.model.version}</p>
      <p className="mt-2 text-sm text-slate-300">{result.notice}</p>
      <p className="mt-2 font-mono text-xs text-slate-400">execution_mode: {result.execution_mode}</p>
      {result.results_artifact && <p className="mt-4 break-all border-t border-border pt-3 font-mono text-[10px] text-slate-500">{result.results_artifact}</p>}
    </section>
  );
}
