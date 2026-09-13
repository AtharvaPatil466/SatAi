"use client";

import { useEffect, useState } from "react";
import { getSceneAsset, getSceneCatalog } from "@/lib/api";
import { resultStateLabel } from "@/lib/result-state";
import type { CatalogScene } from "@/lib/types";

export function UploadScene({ disabled, onSelect }: { disabled: boolean; onSelect: (file: File) => void }) {
  const [scenes, setScenes] = useState<CatalogScene[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getSceneCatalog().then(data => setScenes(data.scenes.filter(scene => scene.catalog_visible))).catch(() => setError("Curated scene pack unavailable.")); }, []);

  async function selectScene(scene: CatalogScene) {
    if (disabled || loading || !scene.available) return;
    setLoading(scene.id); setError(null);
    try {
      const blob = await getSceneAsset(scene.id);
      const extension = blob.type === "image/jpeg" ? "jpg" : "png";
      onSelect(new File([blob], `${scene.id}.${extension}`, { type: blob.type || "image/png" }));
    } catch { setError("Curated scene asset unavailable or unverified."); }
    finally { setLoading(null); }
  }

  return <div className="space-y-2">
    <label htmlFor="scene-upload" className="block text-sm font-semibold">Upload PNG/JPEG</label>
    <input id="scene-upload" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={disabled}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onSelect(file); }}
      className="w-full rounded-lg border border-border p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:p-2 file:text-background disabled:opacity-50" />
    <p className="text-xs text-slate-400">Up to 20 MiB. Sensor, location, GSD, and date are not inferred.</p>
    {scenes.length > 0 && <div className="space-y-2 border-t border-border pt-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Curated scenes</p>
      {scenes.map(scene => <div key={scene.id} className="rounded border border-border bg-raised/35 p-3 text-xs">
        <div className="flex items-start justify-between gap-2"><strong>{scene.title}</strong><span className={scene.result_state === "prototype" ? "text-warning" : "text-accent"}>{resultStateLabel(scene.result_state)}</span></div>
        <p className="mt-1 text-slate-400">{scene.source.dataset} · {scene.capability}</p>
        <p className="mt-2 text-slate-300">Question: “{scene.question}”</p>
        {scene.evaluated_expression !== scene.question && <p className="mt-1 text-slate-500">Evaluated expression: “{scene.evaluated_expression}”</p>}
        <button type="button" disabled={disabled || !!loading || !scene.available || scene.result_state === "prototype"} onClick={() => void selectScene(scene)} className="mt-2 w-full rounded border border-accent/40 px-2 py-1.5 text-accent disabled:border-border disabled:text-slate-500">
          {loading === scene.id ? "Loading verified asset…" : scene.available ? "Load curated scene" : "Asset unavailable"}
        </button>
        {!scene.available && <p role="note" className="mt-2 text-warning">{scene.unavailable_reason}</p>}
      </div>)}
    </div>}
    {error && <p role="alert" className="text-xs text-warning">{error}</p>}
  </div>;
}
