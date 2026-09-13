import type { PlanResponse } from "@/lib/types";

export function QueryPanel({ question, onQuestion, plan, busy, hasScene, onPlan, onAnalyze }: {
  question: string; onQuestion: (value: string) => void; plan: PlanResponse | null; busy: boolean; hasScene: boolean; onPlan: () => void; onAnalyze: () => void;
}) {
  const status = !plan ? "UNKNOWN" : plan.missing_inputs.length ? "MISSING INPUT" : !plan.executable || plan.unavailable_capabilities.length ? "UNAVAILABLE" : "AVAILABLE";
  return <section className="panel space-y-4 p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="eyebrow">Question</p>
      <p className="font-mono text-[10px] text-slate-500">plan: {status}</p>
    </div>
    <label htmlFor="question" className="sr-only">Question</label>
    <textarea id="question" value={question} maxLength={2000} disabled={busy} onChange={(event) => onQuestion(event.target.value)} rows={2}
      placeholder="Ask about this scene — e.g. “Locate the buildings.” or “Is there a building in this image?”"
      className="w-full rounded-lg border border-border bg-background p-3 text-sm leading-6 placeholder:text-slate-600 focus:border-accent disabled:opacity-50" />
    <div className="flex flex-wrap gap-3">
      <button onClick={onPlan} disabled={busy || !hasScene || !question.trim()} className="rounded-lg border border-accent px-4 py-2.5 text-sm font-bold text-accent disabled:opacity-50">Plan</button>
      <button onClick={onAnalyze} disabled={busy || status !== "AVAILABLE"} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">Run analysis</button>
    </div>
    <PlanChain plan={plan} status={status} />
    {plan && <details className="border-t border-border pt-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-accent">Plan detail</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-300">{plan.reason}</p>
        <dl className="grid gap-2 break-words sm:grid-cols-2">{Object.entries({ "Selected capability": plan.selected_capability, "Requested capability": plan.requested_capability ?? "Automatic", "Planner version": plan.planner_version, "Planner rule": plan.rule_id, Executable: String(plan.executable), Provider: plan.provider ?? "UNKNOWN", "Required inputs": plan.required_inputs.join(", ") || "None", "Missing inputs": plan.missing_inputs.join(", ") || "None", "Unavailable capabilities": plan.unavailable_capabilities.join(", ") || "None", "Execution plan version": plan.execution_plan_version }).map(([label, value]) => <div key={label}><dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="text-xs text-slate-200">{value}</dd></div>)}</dl>
        <h3 className="text-xs font-semibold text-slate-300">Execution steps</h3>
        <ol className="space-y-2">{plan.steps.map(step => <li key={step.step_id} className="rounded border border-border p-3">
          <p className="text-xs text-slate-200">{step.step_id} · {step.capability} · {step.provider_available ? "AVAILABLE" : "UNAVAILABLE"}</p>
          <p className="text-[10px] text-slate-500">Provider: {step.provider ?? "UNKNOWN"} · Inputs: {step.required_inputs.join(", ") || "None"} · Depends on: {step.depends_on.join(", ") || "None"}</p>
        </li>)}</ol>
      </div>
    </details>}
    <p className="text-[11px] leading-relaxed text-slate-500">Provider availability does not guarantee local model weights or a CUDA GPU.</p>
  </section>;
}

/** The routing decision as a chain, read straight from the plan the backend
 *  returned. Nothing here is a fixed capability or provider name. */
function PlanChain({ plan, status }: { plan: PlanResponse | null; status: string }) {
  if (!plan) {
    return <p className="rounded-lg border border-dashed border-border p-3 text-xs text-slate-500">QUESTION → <span className="text-slate-600">planner not run</span></p>;
  }
  const unavailable = status !== "AVAILABLE";
  return (
    <div aria-label="Execution route" className="space-y-2 rounded-lg border border-border bg-raised/35 p-3">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[11px]">
        <Node label="QUESTION" tone="muted" />
        <Arrow />
        <Node label={plan.selected_capability.toUpperCase()} tone={unavailable ? "warn" : "accent"} />
        <Arrow />
        <Node label={plan.provider ?? "NO PROVIDER"} tone={plan.provider_available ? "accent" : "warn"} />
      </ol>
      <p className="text-[10px] text-slate-500">
        rule {plan.rule_id} · {plan.planner_version} · {plan.requested_capability ? `explicitly requested ${plan.requested_capability}` : "capability selected automatically"}
      </p>
      {plan.unavailable_reason && <p className="text-[11px] text-warning">{plan.unavailable_reason}</p>}
    </div>
  );
}

function Arrow() { return <li aria-hidden className="text-slate-600">→</li>; }

function Node({ label, tone }: { label: string; tone: "muted" | "accent" | "warn" }) {
  const styles = { muted: "border-border text-slate-400", accent: "border-accent/45 bg-accent/10 text-accent", warn: "border-warning/40 bg-warning/10 text-warning" }[tone];
  return <li className={`rounded border px-2 py-1 tracking-[0.08em] ${styles}`}>{label}</li>;
}
