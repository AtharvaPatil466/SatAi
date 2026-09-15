import type { CatalogScene, SceneUploadResponse } from "@/lib/types";

const unknown = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "Unknown" : String(value);

export function SceneMetadata({ sceneId, upload, source }: {
  sceneId: string | null;
  upload: SceneUploadResponse | null;
  source?: CatalogScene["source"] | null;
}) {
  const compact = [
    ["Source", source?.dataset],
    ["Sensor", upload?.sensor ?? source?.sensor],
    ["GSD", upload?.gsd ?? (source?.gsd == null ? null : `${source.gsd} m`)],
  ];
  const details = [
    ["Scene ID", sceneId],
    ["Dataset", source?.dataset],
    ["Source ID", source?.source_id],
    ["Filename", upload?.filename],
    ["Format", upload?.format],
    ["Dimensions", upload ? `${upload.width} × ${upload.height}` : null],
    ["Sensor", upload?.sensor ?? source?.sensor],
    ["GSD", upload?.gsd ?? (source?.gsd == null ? null : `${source.gsd} m`)],
    ["Location", upload?.location ?? source?.location],
    ["Acquired", upload?.acquisition_date ?? source?.acquisition_date],
  ];
  return (
    <div className="relative min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Scene</span>
          <span className="max-w-56 truncate font-mono text-[11px] text-slate-200">{unknown(sceneId)}</span>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {compact.map(([label, value]) => <div key={label} className="flex items-baseline gap-1.5"><dt className="text-[8px] uppercase tracking-[0.12em] text-slate-600">{label}</dt><dd className="font-mono text-[9px] text-slate-400">{unknown(value)}</dd></div>)}
        </dl>
      </div>
      <details className="group mt-1.5 w-fit">
        <summary className="cursor-pointer list-none text-[9px] font-semibold text-slate-500 transition hover:text-accent">Scene details <span aria-hidden className="group-open:hidden">+</span><span aria-hidden className="hidden group-open:inline">−</span></summary>
        <dl className="absolute left-0 top-full z-30 mt-2 grid w-[min(430px,calc(100vw-2rem))] grid-cols-2 gap-x-5 gap-y-3 rounded border border-border bg-[#08131c] p-4 shadow-2xl">
          {details.map(([label, value]) => <div key={label} className={label === "Scene ID" || label === "Source ID" ? "col-span-2" : ""}><dt className="text-[8px] uppercase tracking-[0.13em] text-slate-600">{label}</dt><dd className="mt-1 break-all font-mono text-[10px] text-slate-300">{unknown(value)}</dd></div>)}
        </dl>
      </details>
    </div>
  );
}
