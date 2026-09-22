"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

export function UploadScene({ disabled, onSelect }: {
  disabled: boolean;
  onSelect: (file: File) => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  function closePicker() {
    if (details.current) details.current.open = false;
    summary.current?.focus();
  }

  async function upload(file: File) {
    if (disabled || uploading) return;
    setUploading(true); setError(null);
    try {
      const failure = await onSelect(file);
      if (failure) setError(failure); else closePicker();
    } catch { setError("Upload failed. Please retry."); }
    finally { setUploading(false); }
  }

  return <details ref={details} className="relative">
    <summary ref={summary} className="flex cursor-pointer list-none items-center gap-2 rounded border border-border px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-accent/40 hover:text-white">
      <Upload size={14} /> Load scene
    </summary>
    <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-md border border-border bg-[#0a1620] p-3 shadow-2xl">
      <label htmlFor="scene-upload" className={`flex min-h-24 cursor-pointer flex-col justify-center rounded border border-border bg-raised/30 px-4 transition hover:border-accent/45 hover:bg-raised/50 ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}>
        <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-200"><Upload size={15} className="text-accent" />{uploading ? "Uploading image..." : "Upload satellite image"}</span>
        <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">PNG / JPEG · Max 20 MB</span>
      </label>
      <input id="scene-upload" aria-label="Satellite image file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={disabled || uploading}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} className="sr-only" />
      {error && <p role="alert" className="mt-2 text-xs text-warning">{error}</p>}
    </div>
  </details>;
}
