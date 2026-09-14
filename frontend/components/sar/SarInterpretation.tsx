"use client";

import type { SarReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SAR_REGIONS, type RegionKey } from "./regions";

interface SarInterpretationProps {
  report: SarReport;
  active: RegionKey | null;
  onActive: (key: RegionKey | null) => void;
}

export function SarInterpretation({ report, active, onActive }: SarInterpretationProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {SAR_REGIONS.map(({ key, label, category, guide, icon: Icon }) => {
          const isActive = active === key;
          const dimmed = active !== null && !isActive;
          return (
            <article
              key={key}
              onMouseEnter={() => onActive(key)}
              onMouseLeave={() => onActive(null)}
              className={cn(
                "panel p-4 transition duration-200",
                isActive && "ring-2 ring-inset ring-electric",
                dimmed && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2 text-ash">
                <Icon size={16} />
                <h2 className="text-xs font-[600] uppercase tracking-wider text-ink">{label}</h2>
              </div>
              <p className="mt-2 text-sm font-[600] text-ink">{category}</p>
              <p className="mt-1 text-xs leading-5 text-midgray">{guide}</p>
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-[11px] font-[500] uppercase tracking-wider text-midgray">
                  Analyst note
                  <span className="ml-1 group-open:hidden">+</span>
                  <span className="ml-1 hidden group-open:inline">−</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-sm leading-6 text-deepgray">
                  {report.summaries[key]}
                </p>
              </details>
            </article>
          );
        })}
      </div>
      <details className="panel group p-5">
        <summary className="cursor-pointer list-none text-sm font-[500] text-ash">
          View full analyst annotation
          <span className="ml-1 group-open:hidden">+</span>
          <span className="ml-1 hidden group-open:inline">−</span>
        </summary>
        <div className="prose-annotation mt-5 whitespace-pre-wrap border-t border-border pt-4 text-sm leading-6 text-deepgray">
          {report.annotation}
        </div>
      </details>
    </div>
  );
}
