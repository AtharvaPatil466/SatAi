"use client";

import { useState } from "react";
import { sensorNecessityRenderUrl } from "@/lib/api";

type ViewerState = "LOADING" | "SUCCESS" | "UNAVAILABLE";

export function SarViewer({ title, detail, render, control = false }: {
  title: string;
  detail: string;
  render: { url: string; available: boolean };
  control?: boolean;
}) {
  const [state, setState] = useState<ViewerState>("LOADING");

  if (!render.available) {
    return (
      <figure className={`panel overflow-hidden ${control ? "border-warning/50" : ""}`}>
        <PanelHeader title={title} detail={detail} control={control} />
        <div className="grid aspect-[4/3] place-items-center bg-[#090c16] p-8 text-center">
          <div role="status" className="max-w-sm text-sm text-slate-300">
            This frozen render is unavailable. No placeholder or substitute scientific imagery is shown.
          </div>
        </div>
      </figure>
    );
  }

  return (
    <figure className={`panel overflow-hidden ${control ? "border-warning/50" : ""}`}>
      <PanelHeader title={title} detail={detail} control={control} />
      <div className="relative aspect-[4/3] bg-[#090c16]">
        <img
          src={sensorNecessityRenderUrl(render.url)}
          alt={`${title}: frozen real Sentinel-1/Sentinel-2 experiment render`}
          onLoad={() => setState("SUCCESS")}
          onError={() => setState("UNAVAILABLE")}
          className={`absolute inset-0 size-full object-contain ${state === "SUCCESS" ? "" : "invisible"}`}
        />
        {state !== "SUCCESS" && (
          <div role="status" className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-slate-300">
            {state === "LOADING" ? "Loading frozen render…" : "Frozen render unavailable. No substitute imagery is shown."}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 grid-overlay opacity-20" />
      </div>
    </figure>
  );
}

function PanelHeader({ title, detail, control }: { title: string; detail: string; control: boolean }) {
  return (
    <figcaption className="flex min-h-20 items-start justify-between gap-3 border-b border-border bg-raised/40 p-4">
      <div>
        <p className="text-xs font-black tracking-[0.13em] text-white">{title}</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-400">{detail}</p>
      </div>
      {control && (
        <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[9px] font-black tracking-wider text-warning">
          NEGATIVE CONTROL
        </span>
      )}
    </figcaption>
  );
}
