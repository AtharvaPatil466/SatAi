import type { SensorNecessityScene } from "@/lib/types";

/** Provenance facts returned from the tracked frozen-scene manifests. */
export function SarProvenance({ scene }: { scene: SensorNecessityScene }) {
  const separation = `${(scene.temporal_separation_seconds / 3600).toFixed(2)} hours`;
  return (
    <section className="panel space-y-4 p-5" aria-label="Scene provenance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">Scene provenance</p>
        <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-black tracking-[0.08em] text-success">REAL DATA · CDSE / SENTINEL HUB</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Provenance label="S1 product" value={scene.s1.product_id} mono />
        <Provenance label="S2 product" value={scene.s2.product_id} mono />
        <Provenance label="S1 acquisition" value={scene.s1.timestamp} />
        <Provenance label="S2 acquisition" value={scene.s2.timestamp} />
        <Provenance label="Temporal separation" value={separation} />
        <Provenance label="Polarization" value={scene.s1.polarization.join(" / ")} />
        <Provenance label="Orbit" value={`${scene.s1.orbit_direction} · relative orbit ${scene.s1.relative_orbit}`} />
        <Provenance label="S2 cloud cover" value={`${scene.s2.cloud_cover_percent}%`} />
        <Provenance label="CRS / grid" value={`${scene.grid.crs} · ${scene.grid.width}×${scene.grid.height}`} />
        <Provenance label="Source" value="Copernicus Data Space Ecosystem · Sentinel Hub Process API" />
      </dl>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">S1 processing</p>
        <p className="mt-1 break-words font-mono text-[11px] leading-relaxed text-slate-300">
          {scene.s1.processing.backscatter_coefficient} ({scene.s1.processing.stored_units}) · orthorectification {scene.s1.processing.orthorectification ? "enabled" : "disabled"} · DEM {scene.s1.processing.dem_instance}
        </p>
      </div>
    </section>
  );
}

function Provenance({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-raised/45 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className={`mt-2 break-words text-xs leading-5 text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
