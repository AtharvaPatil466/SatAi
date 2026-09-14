"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, History, RefreshCw, ShieldCheck } from "lucide-react";
import { getTraces, verifyTraces } from "@/lib/api";
import type { TraceRecord } from "@/lib/types";
import { ExecutionBadge } from "@/components/analysis/ExecutionBadge";
import { formatTimestamp, shortHash } from "@/lib/utils";

export default function ExecutionsPage() {
  const [records, setRecords] = useState<TraceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<string | null>(null);
  const load = useCallback(() => { getTraces().then((data) => { setRecords(data.records); setError(null); }).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => { load(); }, [load]);
  async function verify() { try { const result = await verifyTraces(); setVerification(result.message); } catch (reason) { setVerification(reason instanceof Error ? reason.message : "Verification failed"); } }
  return (
    <div><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Execution history</p><h1 className="mt-2 text-[40px] font-[600] tracking-[-0.02em] text-ink sm:text-[56px]">Audit trail</h1><p className="muted mt-2">Process-local execution records, cryptographically linked in invocation order.</p></div><div className="flex gap-2"><button onClick={load} aria-label="Refresh executions" className="rounded-lg border border-border bg-surface p-2.5 text-deepgray hover:text-ash"><RefreshCw size={17} /></button><button onClick={verify} className="flex items-center gap-2 rounded-pill border border-ivory/40 px-5 py-2 text-sm font-[500] text-ivory transition hover:bg-graphite"><ShieldCheck size={16} /> Verify chain</button></div></div>
      {verification && <div className="mb-5 flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 p-4 text-sm text-success"><CheckCircle2 size={17} /> {verification}</div>}
      {error && <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-5 text-error">{error}</div>}
      {!error && records.length === 0 && <div className="panel grid min-h-72 place-items-center p-8 text-center"><div><History className="mx-auto text-midgray" size={32} /><h2 className="mt-4 font-[500] text-deepgray">No executions in this API process yet</h2><p className="mt-2 text-sm text-midgray">Run the golden analysis in Workspace, then refresh this view.</p></div></div>}
      <div className="space-y-3">{records.map((record, index) => <article key={record.record_hash} className="panel grid gap-4 p-5 md:grid-cols-[72px_1fr_auto] md:items-center"><div className="font-mono text-xs text-midgray">#{records.length - index}</div><div><p className="text-sm font-[500] text-ivory">{record.input_summary.question}</p><p className="mt-2 font-mono text-[10px] text-midgray">{record.params.scene_id} · {shortHash(record.record_hash)} · {formatTimestamp(record.timestamp_iso)}</p></div><ExecutionBadge mode={record.params.execution_mode} /></article>)}</div>
    </div>
  );
}
