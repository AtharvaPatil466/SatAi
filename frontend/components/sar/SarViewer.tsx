import { useState } from "react";
import { sarImageUrl } from "@/lib/api";

export function SarViewer({ scene, available }: { scene: string; available: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="panel relative min-h-[420px] overflow-hidden bg-[#090c16]">
      {available && !failed ? <img src={sarImageUrl(scene)} onError={() => setFailed(true)} alt={`Processed Sentinel-1 SAR scene: ${scene}`} className="absolute inset-0 size-full object-contain" /> : <div role="status" className="absolute inset-0 grid place-items-center p-8 text-center"><p>Processed render unavailable. No substitute imagery is shown.</p></div>}
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-20" />
      <div className="absolute left-4 top-4 rounded-md border border-border bg-background/85 px-3 py-2 text-xs font-semibold backdrop-blur">Sentinel-1 · RTC false color</div>
    </div>
  );
}
