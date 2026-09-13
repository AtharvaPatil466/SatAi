"use client";

import { boxStyle, formatConfidence, parseEvidence } from "@/lib/evidence";
import type { EvidenceRecord, TraceRecord } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { IntegrityBadge } from "./IntegrityBadge";
import { TraceDrawer } from "./TraceDrawer";

/** Visual grounding evidence and execution provenance are different claims:
 *  one is what the model saw, the other is how the run is accounted for.
 *  Both stay visible. `evidence` is optional so execution history, which has
 *  traces but no analysis payload, renders provenance alone. */
export function EvidencePanel({ trace, evidence, selected, onSelect }: {
  trace: TraceRecord;
  evidence?: EvidenceRecord[] | null;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
}) {
  const showGrounding = evidence !== undefined;
  return (
    <section className="panel p-5">
      {showGrounding && <GroundingEvidence evidence={evidence} selected={selected ?? null} onSelect={onSelect} />}
      <div className="mb-4 flex items-center justify-between"><p className="eyebrow">Execution provenance</p><IntegrityBadge /></div>
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

function GroundingEvidence({ evidence, selected, onSelect }: {
  evidence: EvidenceRecord[] | null | undefined;
  selected: number | null;
  onSelect?: (index: number | null) => void;
}) {
  const { boxes, unsupported, total } = parseEvidence(evidence);
  return (
    <div className="mb-5 border-b border-border pb-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="eyebrow">Visual evidence</p>
        <span className="font-mono text-[10px] text-slate-500">{boxes.length} / {total} drawable</span>
      </div>
      {boxes.length === 0 && unsupported.length === 0 && (
        <p className="text-xs text-slate-400">
          {total === 0
            ? "This capability returned no grounding evidence. The answer stands on the execution record below."
            : "No drawable grounding evidence was returned."}
        </p>
      )}
      {boxes.length > 0 && <ul data-testid="grounding-evidence-list" className="space-y-2">
        {boxes.map((box) => {
          const active = selected === box.index;
          const confidence = formatConfidence(box.confidence);
          const style = boxStyle(box);
          return (
            <li key={box.index}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect?.(active ? null : box.index)}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${active ? "border-accent bg-accent/10" : "border-border bg-raised/45 hover:border-accent/45"}`}
              >
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border font-mono text-[10px] ${active ? "border-accent bg-accent text-background" : "border-border text-slate-400"}`}>{box.index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="break-words text-sm font-semibold text-slate-100">{box.label}</span>
                    <span className="font-mono text-[11px] text-accent">{confidence ? `confidence ${confidence}` : "confidence not reported"}</span>
                  </span>
                  <span className="mt-1 block break-all font-mono text-[10px] leading-4 text-slate-500">
                    xyxy [{box.x1.toFixed(4)}, {box.y1.toFixed(4)}, {box.x2.toFixed(4)}, {box.y2.toFixed(4)}] · normalized_xyxy
                  </span>
                  <span className="mt-1 block font-mono text-[10px] text-slate-500">
                    extent {style.width} × {style.height} of scene{box.sourceSceneId ? ` · ${box.sourceSceneId}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>}
      {unsupported.length > 0 && (
        <ul className="mt-2 space-y-1">
          {unsupported.map((item) => (
            <li key={item.index} role="note" className="rounded border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
              Item {item.index + 1} (type <span className="font-mono">{item.type}</span>) is not rendered: {item.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Evidence({ label, value, detail, mono = false }: { label: string; value: string; detail?: string; mono?: boolean }) {
  return <div className="rounded-lg border border-border bg-raised/45 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-2 break-words text-xs leading-5 text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</p>{detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}</div>;
}
