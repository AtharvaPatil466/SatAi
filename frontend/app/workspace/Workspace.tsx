"use client";

import { useRef, useState } from "react";
import { ApiError, analyzeScene, errorMessage, errorState, getTraces, planAnalysis, uploadScene, verifyTraces } from "@/lib/api";
import type { AnalysisRequest, AnalysisResponse, OperationState, PlanResponse, SceneUploadResponse, TraceHistory, TraceVerification } from "@/lib/types";
import { ImageryViewer } from "@/components/imagery/ImageryViewer";
import { SceneMetadata } from "@/components/imagery/SceneMetadata";
import { UploadScene } from "@/components/imagery/UploadScene";
import { QueryPanel } from "@/components/analysis/QueryPanel";
import { AnalysisResult } from "@/components/analysis/AnalysisResult";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";

const GOLDEN_SCENE = "loveda_LoveDA_images_png_0_gsd0.3";
const GOLDEN_QUESTION = "Is there a building in this image?";

export function Workspace() {
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [upload, setUpload] = useState<SceneUploadResponse | null>(null);
  const [question, setQuestion] = useState("");
  const [planned, setPlanned] = useState<{ request: AnalysisRequest; plan: PlanResponse } | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<number | null>(null);
  const [history, setHistory] = useState<TraceHistory | null>(null);
  const [verification, setVerification] = useState<TraceVerification | null>(null);
  const [state, setState] = useState<OperationState>("IDLE");
  const [message, setMessage] = useState("Select a scene to begin.");
  const [traceError, setTraceError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pending = useRef(false);
  const busy = state === "LOADING" || verifying;
  const alert = state === "INVALID INPUT" || state === "UNAVAILABLE" || state === "EXECUTION ERROR";

  function clear() {
    setPlanned(null); setResult(null); setSelectedEvidence(null); setHistory(null); setVerification(null); setTraceError(null); setState("IDLE"); setMessage("Plan the current scene and question.");
  }
  function fail(reason: unknown) { setState(errorState(reason)); setMessage(errorMessage(reason)); }

  async function selectFile(file: File) {
    if (pending.current) return;
    pending.current = true;
    clear(); setSceneId(null); setUpload(null);
    try {
      if (!(file.type ? ["image/png", "image/jpeg"].includes(file.type) : /\.(png|jpe?g)$/i.test(file.name))) throw new ApiError(422, "Only PNG and JPEG images are supported.");
      if (!file.size || file.size > 20 * 1024 * 1024) throw new ApiError(413, "Select a non-empty image up to 20 MiB.");
      setState("LOADING"); setMessage("Uploading scene…");
      const data = await uploadScene(file);
      setUpload(data); setSceneId(data.scene_id); setState("SUCCESS"); setMessage("Scene uploaded. Enter a question and plan it.");
    } catch (reason) { fail(reason); }
    finally { pending.current = false; }
  }

  async function plan() {
    if (pending.current || !sceneId || !question.trim()) return;
    pending.current = true; clear(); setState("LOADING"); setMessage("Planning…");
    const request = { scene_id: sceneId, question: question.trim(), sensor: upload?.sensor ?? "UNKNOWN" };
    try {
      const data = await planAnalysis(request);
      setPlanned({ request, plan: data });
      setState(data.missing_inputs.length ? "INVALID INPUT" : !data.executable || data.unavailable_capabilities.length ? "UNAVAILABLE" : "SUCCESS");
      setMessage(data.missing_inputs.length ? "MISSING INPUT: " + data.missing_inputs.join(", ") : data.executable ? "Plan ready. Analysis has not run." : data.unavailable_reason ?? "Plan unavailable.");
    } catch (reason) { fail(reason); }
    finally { pending.current = false; }
  }

  async function analyze() {
    if (pending.current || !planned?.plan.executable || planned.plan.unavailable_capabilities.length) return;
    pending.current = true; setResult(null); setSelectedEvidence(null); setHistory(null); setVerification(null); setTraceError(null); setState("LOADING"); setMessage("Analyzing…");
    try {
      const data = await analyzeScene(planned.request);
      setResult(data);
      try { setHistory(await getTraces()); } catch (reason) { setTraceError(errorMessage(reason)); }
      setState("SUCCESS"); setMessage(`Analysis completed: ${data.execution_mode}.`);
    } catch (reason) { fail(reason); }
    finally { pending.current = false; }
  }

  async function verify() {
    if (pending.current) return;
    pending.current = true; setVerifying(true); setVerification(null); setTraceError(null);
    try { setHistory(await getTraces()); setVerification(await verifyTraces()); }
    catch (reason) { setTraceError(errorMessage(reason)); }
    finally { pending.current = false; setVerifying(false); }
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
    {/* Imagery is the hero: pixels first, controls beneath, analysis alongside. */}
    <div className="min-w-0 space-y-4">
      <ImageryViewer key={sceneId ?? "empty"} sceneId={sceneId} evidence={result?.evidence} selected={selectedEvidence} onSelect={setSelectedEvidence} />
      <SceneMetadata sceneId={sceneId} upload={upload} />
      <div className="grid gap-4 lg:grid-cols-2">
        <QueryPanel question={question} onQuestion={value => { if (pending.current) return; clear(); setQuestion(value); }} plan={planned?.plan ?? null} busy={busy} hasScene={!!sceneId} onPlan={plan} onAnalyze={analyze} />
        <div className="panel space-y-3 p-5">
          <p className="eyebrow">Scene source</p>
          <UploadScene disabled={busy} onSelect={selectFile} />
          <button disabled={busy} onClick={() => { if (pending.current) return; clear(); setSceneId(GOLDEN_SCENE); setUpload(null); setQuestion(GOLDEN_QUESTION); }} className="w-full rounded border border-border px-4 py-2 text-sm text-accent disabled:opacity-50">Use exact golden demo</button>
          {sceneId === GOLDEN_SCENE && <p className="text-xs text-warning">{question.trim() === GOLDEN_QUESTION ? "Exact committed demo pair selected. Cached fallback is eligible if live execution is unavailable." : "Question changed. The exact golden cached result is not eligible."}</p>}
          <div role={alert ? "alert" : "status"} className="rounded-lg border border-border bg-raised/35 p-3 text-xs">
            <strong className="font-mono tracking-[0.08em] text-slate-300">{state}</strong>
            <p className="mt-1.5 leading-relaxed text-slate-400">{message}</p>
          </div>
        </div>
      </div>
    </div>
    <div className="min-w-0 space-y-4">
      {!result && <div className="panel p-5 text-xs leading-relaxed text-slate-500">
        <p className="eyebrow mb-2">Analysis</p>
        No analysis has run for this scene. The answer, its visual evidence, and the execution record appear here.
      </div>}
      {result && <><AnalysisResult result={result} />
        <EvidencePanel trace={result.trace} evidence={result.evidence ?? null} selected={selectedEvidence} onSelect={setSelectedEvidence} />
        <section className="panel space-y-3 p-4 text-sm">
          <p className="text-xs text-slate-400">{history ? `${history.count} persisted trace records.` : "History could not be refreshed."} <a href="/executions" className="text-accent underline">Inspect history</a></p>
          <button disabled={busy} onClick={verify} className="w-full rounded border border-accent p-2 text-xs text-accent disabled:opacity-50">{verifying ? "Verifying…" : "Verify trace chain"}</button>
          {verification && <p role="status" className={`text-xs ${verification.verified ? "text-success" : "text-error"}`}>{verification.verified ? "VERIFIED" : "FAILED"}: {verification.message}</p>}
          {traceError && <p role="alert" className="text-xs text-warning">Trace unavailable: {traceError}</p>}
        </section>
      </>}
    </div>
  </div>;
}
