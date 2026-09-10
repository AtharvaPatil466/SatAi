"use client";

import { useEffect, useState } from "react";
import { errorMessage, getCapabilities } from "@/lib/api";
import type { CapabilityStatus as Capability } from "@/lib/types";

export function CapabilityStatus({ compact = false }: { compact?: boolean }) {
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getCapabilities().then(data => setCapabilities(data.capabilities)).catch(reason => setError(errorMessage(reason))); }, []);
  return <section className={compact ? "space-y-4" : "panel space-y-4 p-5"} aria-label="Capability status">
    <h2 className="eyebrow">Backend capabilities</h2>
    {!capabilities && !error && <p role="status">LOADING…</p>}
    {error && <p role="alert" className="text-warning">UNKNOWN: {error}</p>}
    {capabilities?.map(item => <div key={item.name} className="text-sm"><p>{item.name} · <span className={item.available ? "text-success" : "text-warning"}>{item.available ? "AVAILABLE" : "IN DEVELOPMENT / UNAVAILABLE"}</span></p><p className="text-xs text-slate-400">Provider: {item.provider ?? "Not registered"}</p></div>)}
    <p className="text-xs text-slate-400">Availability reports registered implementations. Arbitrary VQA also requires cached model weights and a CUDA GPU; API health does not check model readiness.</p>
  </section>;
}
