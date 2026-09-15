"use client";

import { useRef, useState } from "react";
import { createReportPayload, downloadPdf, generatePdf, reportFilename, type ReportContext } from "@/lib/report";
import { resultStateFromExecution } from "@/lib/result-state";
import { Crosshair } from "lucide-react";
import { boxStyle, formatConfidence, parseEvidence } from "@/lib/evidence";
import type { AnalysisResponse, EvidenceRecord, TraceRecord, TraceVerification } from "@/lib/types";
import { TraceDrawer } from "./TraceDrawer";

export function EvidencePanel({ trace, evidence, selected, onSelect, onFocus, onVerify, verification, verifying, verificationError, report }: {
  report?: { result: AnalysisResponse; context: ReportContext };
  trace: TraceRecord;
  evidence?: EvidenceRecord[] | null;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  onFocus?: (index: number) => void;
  onVerify?: () => void;
  verification?: TraceVerification | null;
  verifying?: boolean;
  verificationError?: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportPending = useRef(false);
  const canExport = !!report && !!report.result.answer.trim() && !!report.context.sceneId && !!report.context.question.trim() && resultStateFromExecution(report.result.execution_mode, report.result.results_artifact) !== "unverified";
  async function exportReport() {
    if (!canExport || !report || exportPending.current) return;
    exportPending.current = true; setExporting(true); setExportError(null);
    try {
      const payload = createReportPayload(report.result, report.context);
      const bytes = await generatePdf(payload);
      downloadPdf(bytes, reportFilename(payload.sceneId, payload.generatedAt));
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Report export failed. Please retry.");
    } finally { exportPending.current = false; setExporting(false); }
  }
  const showGrounding = evidence !== undefined;
  const { boxes, unsupported, total } = parseEvidence(evidence);
  return <section className="result-reveal px-5 py-5">
    {showGrounding && <div>
      <div className="mb-3 flex items-center justify-between"><p className="eyebrow">Evidence</p>{total > 0 && <span className="font-mono text-[9px] text-slate-500">{boxes.length} / {total} drawable</span>}</div>
      {boxes.length === 0 && unsupported.length === 0 && <p className="text-xs leading-relaxed text-slate-400">No spatial evidence was produced for this analysis.</p>}
      {boxes.length > 0 && <ul data-testid="grounding-evidence-list" className="space-y-2">{boxes.map(box => {
        const active = selected === box.index;
        const confidence = formatConfidence(box.confidence);
        const style = boxStyle(box);
        return <li key={box.index} className={`rounded border p-3 transition-colors ${active ? "border-accent bg-accent/[0.07]" : "border-border bg-raised/30"}`}>
          <button type="button" aria-pressed={active} onClick={() => onSelect?.(active ? null : box.index)} className="w-full text-left">
            <span className="flex items-start justify-between gap-2"><strong className="break-words text-xs text-slate-100">{box.label}</strong>{confidence && <span className="shrink-0 font-mono text-[9px] text-accent">{confidence}</span>}</span>
            <span className="mt-1.5 block font-mono text-[9px] text-slate-500">xyxy [{box.x1.toFixed(4)}, {box.y1.toFixed(4)}, {box.x2.toFixed(4)}, {box.y2.toFixed(4)}] · normalized_xyxy</span>
            {confidence && <span className="sr-only">confidence {confidence}</span>}
          </button>
          {onFocus && <button type="button" onClick={() => { onSelect?.(box.index); onFocus(box.index); }} className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-accent hover:text-white"><Crosshair size={11} /> Focus</button>}
          <span className="sr-only">extent {style.width} × {style.height} of scene{box.sourceSceneId ? ` · ${box.sourceSceneId}` : ""}</span>
        </li>;
      })}</ul>}
      {unsupported.length > 0 && <ul className="mt-2 space-y-1">{unsupported.map(item => <li key={item.index} role="note" className="rounded border border-warning/30 bg-warning/5 p-2 text-[10px] text-warning">Item {item.index + 1} (type <span className="font-mono">{item.type}</span>) is not rendered: {item.reason}</li>)}</ul>}
    </div>}
    {!showGrounding && <div className="mb-3"><p className="eyebrow">Execution provenance</p><p className="mt-2 break-words text-xs text-slate-400">{trace.model_name} · {trace.params.capability ?? "Not reported"} · {trace.record_hash}</p></div>}
    <div className={`${showGrounding ? "mt-5 border-t border-border pt-4" : ""} flex items-stretch gap-2`}><TraceDrawer artifact={report?.result.results_artifact} trace={trace} onVerify={onVerify} verification={verification} verifying={verifying} verificationError={verificationError} />
      {report && <button type="button" disabled={!canExport || exporting} onClick={exportReport} className="shrink-0 rounded border border-border bg-raised/35 px-3 py-2.5 text-xs font-semibold text-slate-200 disabled:opacity-50">{exporting ? "Generating…" : "Download report"}</button>}
    </div>
    {exportError && <p role="alert" className="mt-2 text-xs text-error">{exportError}</p>}
  </section>;
}
