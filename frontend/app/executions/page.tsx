"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, getTraces, verifyTraces } from "@/lib/api";
import type { TraceHistory, TraceVerification } from "@/lib/types";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";

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
      setHistory(await getTraces());
      if (verify) setVerification(await verifyTraces());
    } catch (reason) { setHistory(null); setError(errorMessage(reason)); }
    finally { pending.current = false; setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  return <div className="space-y-5">
    <div><p className="eyebrow">Execution history</p><h1 className="mt-2 text-3xl font-bold">Audit trail</h1><p className="muted mt-2">Persisted execution records, cryptographically linked in invocation order.</p></div>
    <div className="flex gap-3">
      <button disabled={loading} onClick={() => load()} className="rounded border border-border p-3 disabled:opacity-50">Refresh executions</button>
      <button disabled={loading} onClick={() => load(true)} className="rounded border border-accent p-3 text-accent disabled:opacity-50">Verify chain</button>
    </div>
    {loading && <p role="status">LOADING…</p>}
    {error && <p role="alert" className="text-warning">UNAVAILABLE: {error}</p>}
    {verification && <p role="status" className={verification.verified ? "text-success" : "text-error"}>{verification.verified ? "VERIFIED" : "FAILED"}: {verification.message}</p>}
    {!loading && history && <p>{history.count ? `${history.count} persisted records` : "No persisted executions yet. Run a successful analysis in Workspace."}</p>}
    {!loading && history?.records.map(record => <EvidencePanel key={record.record_hash} trace={record} />)}
  </div>;
}
