"use client";

import { useEffect, useState } from "react";
import { errorMessage, getCapabilities, getSar, getSceneCatalog } from "@/lib/api";
import type { CapabilityStatus as Capability, CatalogScene } from "@/lib/types";

const CAPABILITIES = ["single_image_vqa", "grounding", "change_vqa", "optical_sar"] as const;
type CapabilityName = (typeof CAPABILITIES)[number];
type LoadState = { capabilities: Capability[] | null; scenes: CatalogScene[] | null; sarPrototype: boolean | null };

export function CapabilityStatus({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<LoadState>({ capabilities: null, scenes: null, sarPrototype: null });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    void Promise.allSettled([getCapabilities(), getSceneCatalog(), getSar()]).then(([capabilities, scenes, sar]) => {
      setData({
        capabilities: capabilities.status === "fulfilled" ? capabilities.value.capabilities : null,
        scenes: scenes.status === "fulfilled" ? scenes.value.scenes : null,
        sarPrototype: sar.status === "fulfilled" ? sar.value.human_validation : null,
      });
      setErrors([
        capabilities.status === "rejected" ? errorMessage(capabilities.reason) : "",
        scenes.status === "rejected" ? errorMessage(scenes.reason) : "",
        sar.status === "rejected" ? errorMessage(sar.reason) : "",
      ].filter(Boolean));
    });
  }, []);

  return <section className={compact ? "space-y-4" : "panel space-y-4 p-5"} aria-label="Capability status">
    <div>
      <h2 className="eyebrow">Capability matrix</h2>
      <p className="muted mt-2">Registration, runtime readiness, and cached evidence are separate claims.</p>
    </div>
    {errors.length > 0 && <p role="alert" className="text-sm text-warning">UNKNOWN: {errors.join(" ")}</p>}
    <div className="grid gap-3 xl:grid-cols-2">
      {CAPABILITIES.map(name => <CapabilityCard key={name} name={name} data={data} />)}
    </div>
    <p className="text-xs leading-5 text-slate-400">Live availability comes from local provider readiness. Cached results and human validation are shown separately.</p>
  </section>;
}

function CapabilityCard({ name, data }: { name: CapabilityName; data: LoadState }) {
  const capability = data.capabilities?.find(item => item.name === name);
  const cached = data.scenes?.filter(scene => scene.capability === name && scene.result_state === "cached_real");
  const cachedAvailable = cached?.some(scene => scene.available);
  const cachedUnavailable = cached?.find(scene => !scene.available)?.unavailable_reason;
  const prototype = name === "optical_sar" && data.sarPrototype === true;
  const state = capability?.state ?? (data.capabilities ? "NOT REPORTED" : "UNKNOWN");
  const unavailableReason = !data.capabilities
    ? "UNKNOWN"
    : !capability
      ? "NOT REPORTED"
      : capability.detail ?? "None";

  return <article className="rounded-xl border border-border bg-raised/30 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 className="font-mono text-sm font-semibold text-white">{name}</h3>
      <Status value={state} />
    </div>
    {prototype && <p className="mt-3 text-xs leading-5 text-warning">Human SAR validation is available. This is not AI model output.</p>}
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field label="Provider / model" value={capability ? capability.provider ?? "NOT REPORTED" : data.capabilities ? "NOT REPORTED" : "UNKNOWN"} />
      <Field label="Provider registration" value={capability ? capability.registered ? "YES" : "NO" : data.capabilities ? "NOT REPORTED" : "UNKNOWN"} />
      <Field label="Runtime availability" value={capability ? capability.state : data.capabilities ? "NOT REPORTED" : "UNKNOWN"} />
      <Field label="Cached-real availability" value={cached ? cached.length ? cachedAvailable ? "CACHED REAL" : "UNAVAILABLE" : "NOT REPORTED" : "UNKNOWN"} />
      {cachedUnavailable && <div className="sm:col-span-2"><Field label="Cached artifact" value={cachedUnavailable} /></div>}
      <div className="sm:col-span-2"><Field label="Unavailable reason" value={unavailableReason} /></div>
    </dl>
  </article>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs text-slate-200">{value}</dd></div>;
}

function Status({ value }: { value: string }) {
  const tone = value === "AVAILABLE" ? "border-success/30 bg-success/10 text-success" : value === "UNAVAILABLE" ? "border-error/30 bg-error/10 text-error" : value === "NOT_IMPLEMENTED" ? "border-warning/30 bg-warning/10 text-warning" : "border-border text-slate-400";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${tone}`}>{value}</span>;
}
