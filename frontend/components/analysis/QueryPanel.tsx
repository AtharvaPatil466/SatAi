import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";

export function QueryPanel({ question, onQuestion, phase, hasScene, disabled = false, onAnalyze }: {
  question: string;
  onQuestion: (value: string) => void;
  phase: "READY" | "PLANNING" | "ANALYZING" | "SUCCESS" | "UNAVAILABLE" | "ERROR";
  hasScene: boolean;
  disabled?: boolean;
  onAnalyze: () => void;
}) {
  const busy = disabled || phase === "PLANNING" || phase === "ANALYZING";
  return <section className="border-t border-border bg-[#07121a] p-2.5">
    <form onSubmit={(event) => { event.preventDefault(); onAnalyze(); }} className="flex items-center gap-2 rounded border border-border bg-background/80 p-1.5 focus-within:border-accent/45">
      <Sparkles aria-hidden size={15} className="ml-2 shrink-0 text-accent/70" />
      <div className="min-w-0 flex-1">
        <label htmlFor="question" className="sr-only">Ask SatQuery</label>
        <textarea id="question" value={question} maxLength={2000} disabled={busy} onChange={(event) => onQuestion(event.target.value)} rows={1}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }}
          placeholder="Ask SatQuery about this scene..."
          className="block min-h-10 w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 text-white placeholder:text-slate-600 focus:outline-none disabled:opacity-60" />
      </div>
      <span role="status" className={`hidden font-mono text-[8px] tracking-[0.12em] sm:block ${phase === "UNAVAILABLE" || phase === "ERROR" ? "text-warning" : "text-slate-600"}`}>{phase}</span>
      <button type="submit" disabled={busy || !hasScene || !question.trim()} className="flex h-10 shrink-0 items-center gap-2 rounded-sm bg-accent px-4 text-[10px] font-black uppercase tracking-[0.1em] text-background transition hover:bg-[#71eef2] focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        {phase === "PLANNING" ? "Planning" : phase === "ANALYZING" ? "Analyzing" : "Analyze"}
      </button>
    </form>
  </section>;
}
