import { AlertTriangle } from "lucide-react";
import type { ResolutionReport } from "@/lib/types";

export function DegeneracyWarning({ report }: { report: ResolutionReport }) {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/[0.07] p-5">
      <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-warning" size={18} /><div><p className="font-[500] text-warning">Answer-collapse detected at {report.degenerate_rungs.map((r) => `${Number(r)} m`).join(" and ")}</p><p className="mt-1 text-sm leading-relaxed text-deepgray">These rungs cross the committed 85% predicted-yes threshold. They stay visible for scientific honesty, but are not treated as reliable.</p></div></div>
    </div>
  );
}
