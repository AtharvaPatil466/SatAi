"use client";

import { useEffect, useRef, useState } from "react";
import { sceneImageUrl } from "@/lib/api";
import { boxStyle, formatConfidence, parseEvidence } from "@/lib/evidence";
import type { EvidenceRecord } from "@/lib/types";

type ViewerState = "LOADING" | "SUCCESS" | "UNAVAILABLE";

export function ImageryViewer({ sceneId, evidence, selected, onSelect }: {
  sceneId: string | null;
  evidence?: EvidenceRecord[] | null;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
}) {
  const [state, setState] = useState<ViewerState>("LOADING");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const { boxes } = parseEvidence(evidence);
  const overlay = state === "SUCCESS" && boxes.length > 0;

  // A cached image can finish decoding before React attaches onLoad, which
  // previously left the viewer stuck in LOADING with no pixels reported.
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete) return;
    setState(image.naturalWidth > 0 && image.naturalHeight > 0 ? "SUCCESS" : "UNAVAILABLE");
  }, [sceneId]);

  if (!sceneId) {
    return <Stage><p className="max-w-sm text-center text-sm text-slate-400">Upload a scene or select the exact golden demo. No substitute imagery is shown.</p></Stage>;
  }

  return (
    <Stage>
      {/* The wrapper shrinks to the image's own rendered box, so the overlay
          coordinate space is the rendered image itself rather than the
          letterboxed container. */}
      <div className={`relative inline-block max-w-full leading-none ${state === "SUCCESS" ? "" : "hidden"}`}>
        <img
          ref={imageRef}
          src={sceneImageUrl(sceneId)}
          alt={`Scene ${sceneId}`}
          onLoad={(event) => {
            const image = event.currentTarget;
            setState(image.naturalWidth > 0 && image.naturalHeight > 0 ? "SUCCESS" : "UNAVAILABLE");
          }}
          onError={() => setState("UNAVAILABLE")}
          className="block h-auto max-h-[min(62vh,660px)] w-auto max-w-full object-contain"
        />
        {overlay && (
          <div data-testid="evidence-overlay" className="pointer-events-none absolute inset-0">
            {boxes.map((box) => {
              const active = selected === box.index;
              const confidence = formatConfidence(box.confidence);
              return (
                <button
                  key={box.index}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect?.(active ? null : box.index)}
                  style={boxStyle(box)}
                  className={`pointer-events-auto absolute cursor-pointer border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? "border-accent bg-accent/15 shadow-glow" : "border-accent/55 hover:border-accent"}`}
                >
                  <span className={`absolute left-0 top-0 -translate-y-full whitespace-nowrap px-1 py-0.5 font-mono text-[10px] leading-tight tracking-tight ${active ? "bg-accent text-background" : "bg-background/85 text-accent"}`}>
                    {box.label}{confidence ? ` · ${confidence}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {state !== "SUCCESS" && (
        <p role="status" className="text-sm text-slate-400">
          {state === "LOADING" ? "Loading scene pixels…" : "Scene image unavailable. No substitute imagery is shown."}
        </p>
      )}
      {overlay && (
        <p className="pointer-events-none absolute bottom-3 right-3 rounded border border-border bg-background/85 px-2 py-1 font-mono text-[10px] text-slate-400">
          {boxes.length} grounding {boxes.length === 1 ? "box" : "boxes"} · normalized_xyxy
        </p>
      )}
    </Stage>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel grid-overlay relative flex min-h-[340px] items-center justify-center overflow-hidden p-4 lg:min-h-[540px]">
      {children}
    </div>
  );
}
