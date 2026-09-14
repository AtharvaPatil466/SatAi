import type { AnalysisResponse } from "@/lib/types";
import { ExecutionBadge } from "./ExecutionBadge";

export function AnalysisResult({ result }: { result: AnalysisResponse }) {
  return (
    <section className="rounded-cards bg-surface p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">Answer</p><ExecutionBadge mode={result.execution_mode} /></div>
      <p className="mt-5 text-5xl font-[600] tracking-[-0.06em] text-ivory sm:text-6xl">{result.answer}</p>
      <p className="mt-4 text-sm text-deepgray">{result.model.name}</p>
      <p className="mt-1 text-xs text-midgray">Confidence calibration pending</p>
      {result.results_artifact && <p className="mt-4 break-all border-t border-border pt-3 font-mono text-[10px] text-midgray">{result.results_artifact}</p>}
    </section>
  );
}
