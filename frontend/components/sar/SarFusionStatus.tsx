import type { SensorNecessityReport, SensorNecessityScene } from "@/lib/types";

export function SarFusionStatus({ scene, rule }: { scene: SensorNecessityScene; rule: SensorNecessityReport["locked_rule"] }) {
  const metrics = [
    ["Correct support", scene.correct_support_pixels.toLocaleString(), "pixels"],
    ["Mismatch support", scene.mismatched_support_pixels.toLocaleString(), "pixels"],
    ["Correct / mismatch", `${scene.correct_to_mismatched_support_ratio.toFixed(2)}×`, "support ratio"],
    ["Mismatch reduction", `${scene.support_reduction_percent_when_mismatched.toFixed(2)}%`, "of support"],
  ];

  return (
    <section className="panel space-y-4 p-5" aria-label="Frozen experiment result">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, suffix]) => (
          <div key={label} className="rounded-lg border border-border bg-raised/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
            <p className="text-xs text-slate-400">{suffix}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 text-xs leading-relaxed text-slate-300 lg:grid-cols-2">
        <p className="rounded-lg border border-success/25 bg-success/[0.06] p-3"><strong className="text-success">Correct pair:</strong> real S2 + spatially corresponding real S1.</p>
        <p className="rounded-lg border border-warning/30 bg-warning/[0.06] p-3"><strong className="text-warning">Mismatch control:</strong> the same real S1 values deliberately translated spatially to destroy correspondence.</p>
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-slate-400">
        Frozen rule: NDWI {">"} {rule.ndwi_strictly_greater_than} · VV ≤ {rule.vv_linear_gamma0_terrain_max} · VH ≤ {rule.vh_linear_gamma0_terrain_max} · {rule.component_connectivity}-connected minimum {rule.minimum_component_pixels_inclusive} px
      </p>
    </section>
  );
}
