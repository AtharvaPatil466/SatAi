import type { SceneUploadResponse } from "@/lib/types";

/** Dense horizontal strip under the imagery. Unknown stays UNKNOWN: nothing
 *  here is inferred from the pixels. */
export function SceneMetadata({ sceneId, upload }: { sceneId: string | null; upload: SceneUploadResponse | null }) {
  const fields: [string, string][] = [
    ["Scene", sceneId ?? "Not provided"],
    ["Filename", upload?.filename ?? "Not provided"],
    ["Format", upload?.format ?? "UNKNOWN"],
    ["Dimensions", upload ? `${upload.width} × ${upload.height}` : "UNKNOWN"],
    ["Sensor", upload?.sensor ?? "UNKNOWN"],
    ["GSD", upload?.gsd ?? "UNKNOWN"],
    ["Location", upload?.location ?? "UNKNOWN"],
    ["Acquired", upload?.acquisition_date ?? "Not provided"],
  ];
  return (
    <dl className="panel flex flex-wrap gap-x-6 gap-y-3 px-4 py-3">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-300">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
