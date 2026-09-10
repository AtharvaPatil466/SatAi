import type { PlanResponse } from "@/lib/types";

export function QueryPanel({ question, onQuestion, plan, busy, hasScene, onPlan, onAnalyze }: {
  question: string; onQuestion: (value: string) => void; plan: PlanResponse | null; busy: boolean; hasScene: boolean; onPlan: () => void; onAnalyze: () => void;
}) {
  const status = !plan ? "UNKNOWN" : plan.missing_inputs.length ? "MISSING INPUT" : !plan.executable || plan.unavailable_capabilities.length ? "UNAVAILABLE" : "AVAILABLE";
  return <section className="panel space-y-4 p-5">
    <h2 className="text-2xl font-bold">Ask SatQuery</h2>
    <label htmlFor="question" className="block text-sm font-semibold">Question</label>
    <textarea id="question" value={question} maxLength={2000} disabled={busy} onChange={(event) => onQuestion(event.target.value)} rows={3}
      className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:border-accent disabled:opacity-50" />
    <div className="flex flex-wrap gap-3">
      <button onClick={onPlan} disabled={busy || !hasScene || !question.trim()} className="rounded-lg border border-accent px-4 py-3 text-sm font-bold text-accent disabled:opacity-50">Plan</button>
      <button onClick={onAnalyze} disabled={busy || status !== "AVAILABLE"} className="rounded-lg bg-accent px-4 py-3 text-sm font-bold text-background disabled:opacity-50">Run analysis</button>
    </div>
    <p className="text-xs text-slate-400">Plan: {status}. Provider availability does not guarantee local model weights or a CUDA GPU.</p>
    {plan && <div className="space-y-3 border-t border-border pt-4 text-sm">
      <p>{plan.reason}</p>
      <dl className="grid gap-2 break-words sm:grid-cols-2">{Object.entries({ "Selected capability": plan.selected_capability, "Requested capability": plan.requested_capability ?? "Automatic", "Planner version": plan.planner_version, "Planner rule": plan.rule_id, Executable: String(plan.executable), Provider: plan.provider ?? "UNKNOWN", "Required inputs": plan.required_inputs.join(", ") || "None", "Missing inputs": plan.missing_inputs.join(", ") || "None", "Unavailable capabilities": plan.unavailable_capabilities.join(", ") || "None", "Execution plan version": plan.execution_plan_version }).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd>{value}</dd></div>)}</dl>
      {plan.unavailable_reason && <p className="text-warning">{plan.unavailable_reason}</p>}
      <h3 className="font-semibold">Execution steps</h3>
      <ol className="space-y-2">{plan.steps.map(step => <li key={step.step_id} className="rounded border border-border p-3">
        <p>{step.step_id} · {step.capability} · {step.provider_available ? "AVAILABLE" : "UNAVAILABLE"}</p>
        <p className="text-xs text-slate-400">Provider: {step.provider ?? "UNKNOWN"} · Inputs: {step.required_inputs.join(", ") || "None"} · Depends on: {step.depends_on.join(", ") || "None"}</p>
      </li>)}</ol>
    </div>}
  </section>;
}
