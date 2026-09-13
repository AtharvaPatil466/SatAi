"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, getTraces, verifyTraces } from "@/lib/api";
import { resultStateFromExecution, resultStateLabel } from "@/lib/result-state";
import type { TraceHistory, TraceRecord, TraceVerification } from "@/lib/types";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { formatTimestamp, shortHash } from "@/lib/utils";

export default function ExecutionsPage() {
  const [history, setHistory] = useState<TraceHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<TraceVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const pending = useRef(false);

  async function load(verify = false) {
    if (pending.current) return;
    pending.current = true; setLoading(true); setError(null); setVerification(null);
    try {
      const records = await getTraces();
      setHistory(records);
      if (verify) setVerification(await verifyTraces());
    } catch (reason) { setHistory(null); setError(errorMessage(reason)); }
    finally { pending.current = false; setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const records = history ? [...history.records].reverse() : [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Execution history</p><h1 className="mt-2 text-3xl font-bold">Audit timeline</h1><p className="muted mt-2">Recorded facts only, ordered from the hash-chain genesis to the latest execution.</p></div>
      <div className={`rounded-full border px-3 py-1.5 text-xs font-bold ${verification?.verified ? "border-success/30 bg-success/10 text-success" : verification ? "border-error/30 bg-error/10 text-error" : "border-border text-slate-400"}`}>
        {verification ? (verification.verified ? "VERIFIED" : "FAILED") : "NOT YET VERIFIED"}
      </div>
    </div>
    <div className="flex gap-3">
      <button disabled={loading} onClick={() => void load()} className="rounded border border-border p-3 disabled:opacity-50">Refresh executions</button>
      <button disabled={loading} onClick={() => void load(true)} className="rounded border border-accent p-3 text-accent disabled:opacity-50">Verify chain</button>
    </div>
    {loading && <p role="status">LOADING…</p>}
    {error && <p role="alert" className="text-warning">UNAVAILABLE: {error}</p>}
    {verification && <p role="status" className={verification.verified ? "text-success" : "text-error"}>{verification.verified ? "VERIFIED" : "FAILED"}: {verification.message}</p>}
    {!loading && history && <p className="text-sm text-slate-400">{history.count ? `${history.count} persisted records` : "No persisted executions yet. Run a successful analysis in Workspace."}</p>}
    <ol className="space-y-4">
      {records.map((record, index) => <li key={record.record_hash}><TimelineRecord record={record} index={index + 1} chainVerified={verification?.verified === true} /></li>)}
    </ol>
  </div>;
}

function TimelineRecord({ record, index, chainVerified }: { record: TraceRecord; index: number; chainVerified: boolean }) {
  const state = record.params.result_state === "cached_real" ? "cached_real" : resultStateFromExecution(record.params.execution_mode, record.params.results_artifact);
  const stages = [
    ["REQUEST", record.input_summary.question],
    ["PLANNER", record.params.planner_rule ? `${record.params.planner_rule}${record.params.planner_version ? ` · ${record.params.planner_version}` : ""}` : "NOT RECORDED"],
    ["CAPABILITY", record.params.capability ?? "NOT RECORDED"],
    ["PROVIDER", record.model_name || "NOT RECORDED"],
    ["MODE", resultStateLabel(state)],
    ["TRACE RECORD", shortHash(record.record_hash)],
  ];
  return <article className="panel overflow-hidden">
    <div className="border-b border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-xs text-slate-500">#{index} · {formatTimestamp(record.timestamp_iso)}</p><span className={chainVerified ? "text-xs font-bold text-success" : "text-xs text-slate-500"}>{chainVerified ? "CHAIN VERIFIED" : "RECORDED · UNVERIFIED"}</span></div>
      <ol aria-label={`Execution route ${index}`} className="mt-4 grid gap-2 lg:grid-cols-6">
        {stages.map(([label, value], stage) => <li key={label} className="relative min-w-0 rounded-lg border border-border bg-raised/35 p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-2 break-words text-xs ${stage === 4 ? "font-bold text-accent" : "text-slate-200"}`}>{value}</p>
        </li>)}
      </ol>
      <p className="mt-3 break-all font-mono text-[10px] text-slate-500">previous {record.prev_hash ? shortHash(record.prev_hash) : "GENESIS"} → record {shortHash(record.record_hash)}</p>
    </div>
    <details className="p-4"><summary className="cursor-pointer text-xs font-semibold text-accent">Inspect recorded provenance</summary><div className="mt-4"><EvidencePanel trace={record} /></div></details>
  </article>;
}
