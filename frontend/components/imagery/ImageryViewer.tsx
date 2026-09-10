"use client";

import { useState } from "react";
import { sceneImageUrl } from "@/lib/api";

export function ImageryViewer({ sceneId }: { sceneId: string | null }) {
  const [state, setState] = useState<"LOADING" | "SUCCESS" | "UNAVAILABLE">("LOADING");
  return <div className="panel relative flex min-h-[320px] items-center justify-center overflow-hidden p-4 lg:min-h-[520px]">
    {!sceneId ? <p className="text-slate-400">Upload a scene or select the exact golden demo.</p> : <div className="w-full text-center">
      <img src={sceneImageUrl(sceneId)} alt={`Scene ${sceneId}`} onLoad={() => setState("SUCCESS")} onError={() => setState("UNAVAILABLE")}
        className={`max-h-[600px] w-full object-contain ${state === "UNAVAILABLE" ? "hidden" : ""}`} />
      {state !== "SUCCESS" && <p role="status" className="mt-3 text-sm text-slate-400">{state === "LOADING" ? "Loading scene pixels…" : "Scene image unavailable. No substitute imagery is shown."}</p>}
    </div>}
  </div>;
}
