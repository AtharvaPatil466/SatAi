import type { SceneUploadResponse } from "@/lib/types";

export function SceneMetadata({ sceneId, upload }: { sceneId: string | null; upload: SceneUploadResponse | null }) {
  return <dl className="panel mt-4 grid gap-3 p-4 sm:grid-cols-2">
    {Object.entries({ Scene: sceneId ?? "Not provided", Filename: upload?.filename ?? "Not provided", Format: upload?.format ?? "UNKNOWN", Dimensions: upload ? `${upload.width} × ${upload.height}` : "UNKNOWN", Sensor: upload?.sensor ?? "UNKNOWN", GSD: upload?.gsd ?? "UNKNOWN", Location: upload?.location ?? "UNKNOWN", "Acquisition date": upload?.acquisition_date ?? "Not provided" }).map(([label, value]) => <div key={label}><dt className="eyebrow">{label}</dt><dd className="mt-1 break-all text-xs text-slate-300">{value}</dd></div>)}
  </dl>;
}
