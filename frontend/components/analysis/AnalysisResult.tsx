import { CACHED_EXPLANATION } from "@/lib/report";
import { DatabaseZap, Radio } from "lucide-react";
import { resultStateFromExecution, resultStateLabel } from "@/lib/result-state";
import type { AnalysisResponse } from "@/lib/types";

export function AnalysisResult({ result }: { result: AnalysisResponse }) {
  const state = resultStateFromExecution(result.execution_mode, result.results_artifact);
  const live = state === "real_live";
  return (
    <section className="result-reveal border-b border-border px-5 py-5" aria-live="polite">
      <p className="eyebrow">Answer</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-[1.35rem] font-semibold leading-snug text-white">{result.answer}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.1em] ${live ? "border-success/30 bg-success/[0.07] text-success" : state === "cached_real" ? "border-warning/30 bg-warning/[0.07] text-warning" : "border-border text-slate-400"}`}>
          {live ? <Radio size={11} /> : <DatabaseZap size={11} />}{state === "cached_real" ? "Cached real result" : resultStateLabel(state)}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600">{live ? "LIVE" : state === "cached_real" ? "CACHED RESULT" : "UNAVAILABLE"}</span>
      </div>
      {state === "cached_real" && <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{CACHED_EXPLANATION}</p>}
    </section>
  );
}
