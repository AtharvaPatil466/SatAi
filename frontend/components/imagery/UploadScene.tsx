"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { getSceneAsset, getSceneCatalog } from "@/lib/api";
import { resultStateLabel } from "@/lib/result-state";
import type { CatalogScene } from "@/lib/types";

export function UploadScene({ disabled, onSelect }: {
  disabled: boolean;
  onSelect: (file: File, scene?: CatalogScene) => void;
}) {
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
      onSelect(new File([blob], `${scene.id}.${extension}`, { type: blob.type || "image/png" }), scene);
    } catch { setError("Curated scene asset unavailable or unverified."); }
    finally { setLoading(null); }
  }

  return <details className="relative">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded border border-border px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-accent/40 hover:text-white">
      <Upload size={14} /> Load scene
    </summary>
    <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-md border border-border bg-[#0a1620] p-3 shadow-2xl">
      <label htmlFor="scene-upload" className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Upload PNG / JPEG</label>
      <input id="scene-upload" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={disabled}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onSelect(file); }}
        className="mt-2 w-full rounded border border-border p-2 text-xs file:mr-2 file:rounded-sm file:border-0 file:bg-accent file:px-2 file:py-1.5 file:text-background disabled:opacity-50" />
      <p className="mt-1.5 text-[10px] text-slate-500">Maximum 20 MiB. Metadata is not inferred.</p>
      {scenes.length > 0 && <div className="mt-3 space-y-2 border-t border-border pt-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Verified scene pack</p>
        {scenes.map(scene => <button key={scene.id} type="button" disabled={disabled || !!loading || !scene.available || scene.result_state === "prototype"} onClick={() => void selectScene(scene)} className="w-full rounded border border-border bg-raised/40 p-2 text-left text-xs transition hover:border-accent/40 disabled:opacity-45">
          <span className="flex justify-between gap-3"><strong className="text-slate-200">{scene.title}</strong><span className="shrink-0 font-mono text-[9px] text-accent">{resultStateLabel(scene.result_state)}</span></span>
          <span className="mt-1 block text-[10px] text-slate-500">{scene.source.dataset} · {scene.capability}</span>
          <span className="mt-1.5 block text-[10px] text-slate-300">“{scene.question}”</span>
          {!scene.available && <span className="mt-1 block text-warning">{scene.unavailable_reason}</span>}
        </button>)}
      </div>}
      {error && <p role="alert" className="mt-2 text-xs text-warning">{error}</p>}
    </div>
  </details>;
}
