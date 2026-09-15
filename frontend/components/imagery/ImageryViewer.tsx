"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Focus, Minus, Plus, Scan } from "lucide-react";
import { sceneImageUrl } from "@/lib/api";
import { boxStyle, formatConfidence, parseEvidence } from "@/lib/evidence";
import type { EvidenceRecord } from "@/lib/types";

type ViewerState = "LOADING" | "SUCCESS" | "UNAVAILABLE";
export type ViewerTransform = { scale: number; x: number; y: number };

const FIT: ViewerTransform = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 6;

export function boundTransform(next: ViewerTransform, width = 1200, height = 800): ViewerTransform {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
  if (scale === 1) return FIT;
  return {
    scale,
    x: Math.min((scale - 1) * width / 2, Math.max(-(scale - 1) * width / 2, next.x)),
    y: Math.min((scale - 1) * height / 2, Math.max(-(scale - 1) * height / 2, next.y)),
  };
}

export function ImageryViewer({ sceneId, evidence, selected, onSelect, focusRequest }: {
  sceneId: string | null;
  evidence?: EvidenceRecord[] | null;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  focusRequest?: { index: number; nonce: number } | null;
}) {
  const [state, setState] = useState<ViewerState>("LOADING");
  const [transform, setTransform] = useState<ViewerTransform>(FIT);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const { boxes } = parseEvidence(evidence);
  const overlay = state === "SUCCESS" && boxes.length > 0;

  const bounded = useCallback((next: ViewerTransform) => boundTransform(next, stageRef.current?.clientWidth, stageRef.current?.clientHeight), []);
  const zoomBy = (factor: number) => setTransform(current => bounded({ ...current, scale: current.scale * factor }));

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) setState(image.naturalWidth > 0 && image.naturalHeight > 0 ? "SUCCESS" : "UNAVAILABLE");
    setTransform(FIT);
  }, [sceneId]);

  useEffect(() => {
    if (!focusRequest) return;
    const box = parseEvidence(evidence).boxes.find(item => item.index === focusRequest.index);
    if (!box) return;
    const scale = 3;
    const width = stageRef.current?.clientWidth || 900;
    const height = stageRef.current?.clientHeight || 600;
    const centerX = (box.x1 + box.x2) / 2;
    const centerY = (box.y1 + box.y2) / 2;
    setTransform(bounded({ scale, x: (0.5 - centerX) * width * scale, y: (0.5 - centerY) * height * scale }));
  }, [bounded, evidence, focusRequest]);

  const pointerDown = (event: React.PointerEvent) => {
    if (transform.scale === 1) return;
    drag.current = { x: event.clientX, y: event.clientY, ox: transform.x, oy: transform.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const origin = drag.current;
    setTransform(current => bounded({ ...current, x: origin.ox + event.clientX - origin.x, y: origin.oy + event.clientY - origin.y }));
  };
  const pointerUp = () => { drag.current = null; };

  return (
    <div ref={stageRef} data-testid="imagery-stage" className="instrument-grid relative flex min-h-[440px] flex-1 items-center justify-center overflow-hidden bg-[#03080d] lg:min-h-0"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      style={{ cursor: transform.scale > 1 ? "grab" : "default", touchAction: "none" }}>
      <div role="group" aria-label="Image view controls" className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded border border-border bg-background/90 p-1 shadow-lg">
        <button type="button" aria-label="Zoom out" disabled={!sceneId || transform.scale === MIN_SCALE} onClick={() => zoomBy(1 / 1.4)} className="grid size-7 place-items-center rounded-sm text-slate-300 transition hover:bg-raised hover:text-white disabled:opacity-35"><Minus size={14} /></button>
        <span className="w-10 text-center font-mono text-[9px] text-slate-500">{transform.scale.toFixed(1)}×</span>
        <button type="button" aria-label="Zoom in" disabled={!sceneId || transform.scale === MAX_SCALE} onClick={() => zoomBy(1.4)} className="grid size-7 place-items-center rounded-sm text-slate-300 transition hover:bg-raised hover:text-white disabled:opacity-35"><Plus size={14} /></button>
        <button type="button" aria-label="Fit image" disabled={!sceneId} onClick={() => setTransform(FIT)} className="flex h-7 items-center gap-1 rounded-sm border-l border-border px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 transition hover:bg-raised hover:text-white disabled:opacity-35"><Scan size={13} /> Fit</button>
      </div>

      {!sceneId ? (
        <div className="max-w-sm text-center"><Focus className="mx-auto text-slate-700" size={28} /><p className="mt-3 text-sm text-slate-400">Load satellite imagery to begin analysis.</p><p className="mt-1 text-[11px] text-slate-600">No substitute imagery is shown.</p></div>
      ) : (
        <>
          <div data-testid="imagery-transform" className={`relative inline-block max-h-full max-w-full select-none leading-none transition-transform duration-150 ${state === "SUCCESS" ? "" : "invisible"}`}
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: "center" }}>
            <img ref={imageRef} src={sceneImageUrl(sceneId)} alt={`Scene ${sceneId}`} draggable={false}
              onLoad={(event) => { const image = event.currentTarget; setState(image.naturalWidth > 0 && image.naturalHeight > 0 ? "SUCCESS" : "UNAVAILABLE"); }}
              onError={() => setState("UNAVAILABLE")}
              className="block h-auto max-h-[calc(100vh-196px)] w-auto max-w-full object-contain" />
            {overlay && <div data-testid="evidence-overlay" className="pointer-events-none absolute inset-0">
              {boxes.map(box => {
                const active = selected === box.index;
                const confidence = formatConfidence(box.confidence);
                return <button key={box.index} type="button" aria-pressed={active} onPointerDown={event => event.stopPropagation()} onClick={() => onSelect?.(active ? null : box.index)} style={boxStyle(box)}
                  className={`pointer-events-auto absolute cursor-pointer border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? "border-accent bg-accent/15 shadow-[0_0_0_1px_rgba(71,215,221,.35)]" : "border-accent/60 bg-accent/[0.03] hover:border-accent"}`}>
                  <span className={`absolute left-0 top-0 -translate-y-full whitespace-nowrap px-1.5 py-1 font-mono text-[9px] leading-none ${active ? "bg-accent text-background" : "bg-background/90 text-accent"}`}>{box.label}{confidence ? ` · ${confidence}` : ""}</span>
                </button>;
              })}
            </div>}
          </div>
          {state !== "SUCCESS" && <p role="status" className="absolute text-sm text-slate-400">{state === "LOADING" ? "Loading scene pixels…" : "Scene image unavailable. No substitute imagery is shown."}</p>}
          {overlay && <p className="pointer-events-none absolute bottom-3 right-3 rounded border border-border bg-background/90 px-2 py-1 font-mono text-[9px] text-slate-400">{boxes.length} spatial {boxes.length === 1 ? "region" : "regions"}</p>}
        </>
      )}
    </div>
  );
}
