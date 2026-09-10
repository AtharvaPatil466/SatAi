import type { TraceRecord } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { IntegrityBadge } from "./IntegrityBadge";
import { TraceDrawer } from "./TraceDrawer";

export function EvidencePanel({ trace }: { trace: TraceRecord }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between"><p className="eyebrow">Execution evidence</p><IntegrityBadge /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Evidence label="Identity" value={trace.params.scene_id ?? "Not recorded"} mono />
        <Evidence label="Model" value={trace.model_name} />
        <Evidence label="Model version" value={trace.model_version} />
        <Evidence label="Execution mode" value={trace.params.execution_mode} />
        <Evidence label="Capability" value={trace.params.capability ?? "Not recorded"} />
        <Evidence label="Planner version" value={trace.params.planner_version ?? "Not recorded"} />
        <Evidence label="Planner rule" value={trace.params.planner_rule ?? "Not recorded"} />
        <Evidence label="Question" value={trace.input_summary.question} />
        <Evidence label="Record hash" value={trace.record_hash} mono detail={formatTimestamp(trace.timestamp_iso)} />
        <Evidence label="Previous hash" value={trace.prev_hash || "Genesis (empty previous hash)"} mono />
      </div>
      <div className="mt-4"><TraceDrawer trace={trace} /></div>
    </section>
  );
}

function Evidence({ label, value, detail, mono = false }: { label: string; value: string; detail?: string; mono?: boolean }) {
  return <div className="rounded-lg border border-border bg-raised/45 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-2 break-words text-xs leading-5 text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</p>{detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}</div>;
}
