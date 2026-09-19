"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { errorMessage, getSensorNecessity } from "@/lib/api";
import type { SensorNecessityReport } from "@/lib/types";
import { SarViewer } from "@/components/sar/SarViewer";
import { SarProvenance } from "@/components/sar/SarProvenance";
import { SarFusionStatus } from "@/components/sar/SarFusionStatus";

const PANELS = [
  ["optical", "OPTICAL", "Real Sentinel-2 optical render"],
  ["sar", "SAR", "Real Sentinel-1 VV/VH render"],
  ["correct-fusion", "CORRECT PAIR", "Optical + spatially corresponding SAR"],
  ["mismatched-sar", "MISMATCH CONTROL", "Optical + deliberately translated SAR"],
] as const;

export default function SarPage() {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [report, setReport] = useState<SensorNecessityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSensorNecessity()
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setSelectedSceneId((current) => current ?? data.scenes[0]?.scene_id ?? null);
        }
      })
      .catch((reason) => { if (!cancelled) { setReport(null); setError(errorMessage(reason)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const scene = report?.scenes.find((candidate) => candidate.scene_id === selectedSceneId) ?? null;

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Frozen real-data experiment</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Sensor Necessity</h1>
        <p className="mt-2 text-lg font-semibold text-slate-200">Does the result depend on the correct optical–SAR correspondence?</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.1em]">
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-warning">Deterministic proxy benchmark · Not model performance</span>
          <span className="rounded-full border border-border bg-raised px-3 py-1.5 text-slate-300">Frozen thresholds</span>
          <span className="rounded-full border border-border bg-raised px-3 py-1.5 text-slate-300">No retuning</span>
        </div>
      </div>

      {loading && <div className="panel grid h-64 place-items-center"><LoaderCircle className="animate-spin text-accent" /></div>}

      {!loading && error && (
        <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-5 text-error">
          <p className="font-semibold">Frozen Sensor Necessity data unavailable. No substitute results or imagery are shown.</p>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      )}

      {!loading && scene && report && (
        <>
          <div className="mb-5 flex flex-wrap gap-2" aria-label="Frozen Sensor Necessity scenes">
            {report.scenes.map((candidate) => (
              <button key={candidate.scene_id} onClick={() => setSelectedSceneId(candidate.scene_id)} aria-pressed={scene.scene_id === candidate.scene_id}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${scene.scene_id === candidate.scene_id ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-slate-300 hover:bg-raised"}`}>
                {candidate.geographic_description}
              </button>
            ))}
          </div>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">{scene.geographic_description}</h2>
            <p className="mt-1 font-mono text-[11px] text-slate-500">{scene.scene_id}</p>
          </div>
          <SarFusionStatus scene={scene} rule={report.locked_rule} />
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {PANELS.map(([name, title, detail]) => (
              <SarViewer key={`${scene.scene_id}-${name}`} title={title} detail={detail} render={scene.renders[name]} control={name === "mismatched-sar"} />
            ))}
          </div>
          <div className="mt-5 space-y-5">
            <SarProvenance scene={scene} />
          </div>
        </>
      )}
    </div>
  );
}
