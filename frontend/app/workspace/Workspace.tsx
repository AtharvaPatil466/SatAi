"use client";

import { useRef, useState } from "react";
import { Aperture, ImageIcon } from "lucide-react";
import { ApiError, analyzeScene, errorMessage, errorState, planAnalysis, uploadScene, verifyTraces } from "@/lib/api";
import type { AnalysisRequest, AnalysisResponse, CatalogScene, PlanResponse, SceneUploadResponse, TraceVerification } from "@/lib/types";
import { ImageryViewer } from "@/components/imagery/ImageryViewer";
import { SceneMetadata } from "@/components/imagery/SceneMetadata";
import { UploadScene } from "@/components/imagery/UploadScene";
import { QueryPanel } from "@/components/analysis/QueryPanel";
import { AnalysisResult } from "@/components/analysis/AnalysisResult";
import type { ReportContext } from "@/lib/report";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";

const GOLDEN_SCENE = "loveda_LoveDA_images_png_0_gsd0.3";
const GOLDEN_QUESTION = "Is there a building in this image?";
const GOLDEN_SOURCE: CatalogScene["source"] = { dataset: "LoveDA", dataset_split: null, source_id: GOLDEN_SCENE, sensor: null, gsd: 0.3, location: null, acquisition_date: null };
type Phase = "READY" | "PLANNING" | "ANALYZING" | "SUCCESS" | "UNAVAILABLE" | "ERROR";

export function Workspace() {
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [upload, setUpload] = useState<SceneUploadResponse | null>(null);
  const [source, setSource] = useState<CatalogScene["source"] | null>(null);
  const [question, setQuestion] = useState("");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ index: number; nonce: number } | null>(null);
  const [verification, setVerification] = useState<TraceVerification | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("READY");
  const [message, setMessage] = useState("Load a scene and ask a question to begin.");
  const [verifying, setVerifying] = useState(false);
  const pending = useRef(false);
  const busy = phase === "PLANNING" || phase === "ANALYZING" || verifying;

  function resetAnalysis(nextMessage = "Ready for analysis.") {
    setPlan(null); setResult(null); setReportContext(null); setSelectedEvidence(null); setFocusRequest(null); setVerification(null); setVerificationError(null); setPhase("READY"); setMessage(nextMessage);
  }

  function fail(reason: unknown) {
    setPhase(errorState(reason) === "UNAVAILABLE" ? "UNAVAILABLE" : "ERROR");
    setMessage(errorMessage(reason));
  }

  async function selectFile(file: File, catalogScene?: CatalogScene) {
    if (pending.current) return;
    pending.current = true;
    resetAnalysis("Uploading scene…"); setSceneId(null); setUpload(null); setSource(catalogScene?.source ?? null);
    try {
      if (!(file.type ? ["image/png", "image/jpeg"].includes(file.type) : /\.(png|jpe?g)$/i.test(file.name))) throw new ApiError(422, "Only PNG and JPEG images are supported.");
      if (!file.size || file.size > 20 * 1024 * 1024) throw new ApiError(413, "Select a non-empty image up to 20 MiB.");
      const data = await uploadScene(file);
      setUpload(data); setSceneId(data.scene_id); setPhase("READY"); setMessage("Scene ready. Ask SatQuery about these pixels.");
    } catch (reason) { fail(reason); }
    finally { pending.current = false; }
  }

  async function runAnalysis() {
    if (pending.current || !sceneId || !question.trim()) return;
    pending.current = true;
    setPlan(null); setResult(null); setReportContext(null); setSelectedEvidence(null); setFocusRequest(null); setVerification(null); setVerificationError(null);
    const request: AnalysisRequest = { scene_id: sceneId, question: question.trim(), sensor: upload?.sensor ?? "UNKNOWN" };
    try {
      setPhase("PLANNING"); setMessage("Planning analysis from the current question…");
      const nextPlan = await planAnalysis(request);
      setPlan(nextPlan);
      if (nextPlan.missing_inputs.length || !nextPlan.executable || nextPlan.unavailable_capabilities.length) {
        setPhase("UNAVAILABLE");
        setMessage(nextPlan.missing_inputs.length ? `Missing input: ${nextPlan.missing_inputs.join(", ")}.` : nextPlan.unavailable_reason ?? "The selected capability is unavailable.");
        return;
      }
      setPhase("ANALYZING"); setMessage(`Running ${nextPlan.selected_capability}${nextPlan.provider ? ` with ${nextPlan.provider}` : ""}…`);
      const data = await analyzeScene(request);
      setReportContext({ sceneId: request.scene_id, question: request.question, source, upload, plan: nextPlan });
      setResult(data); setPhase("SUCCESS"); setMessage("Analysis complete.");
    } catch (reason) { fail(reason); }
    finally { pending.current = false; }
  }

  async function verify() {
    if (pending.current) return;
    pending.current = true; setVerifying(true); setVerification(null); setVerificationError(null);
    try { setVerification(await verifyTraces()); }
    catch (reason) { setVerificationError(errorMessage(reason)); }
    finally { pending.current = false; setVerifying(false); }
  }

  return <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
    <section className="flex min-h-[680px] min-w-0 flex-col border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r">
      <header className="flex min-h-[54px] shrink-0 items-center justify-between gap-3 border-b border-border bg-[#09151e] px-3 py-2">
        <SceneMetadata sceneId={sceneId} upload={upload} source={source} />
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" disabled={busy} onClick={() => { if (pending.current) return; resetAnalysis("Prepared scene ready. Ask SatQuery about these pixels."); setSceneId(GOLDEN_SCENE); setUpload(null); setSource(GOLDEN_SOURCE); setQuestion(GOLDEN_QUESTION); }} className="flex items-center gap-1.5 rounded border border-border px-2.5 py-2 text-[10px] font-semibold text-slate-400 transition hover:border-accent/35 hover:text-slate-200 disabled:opacity-50"><ImageIcon size={13} /> Prepared scene</button>
          <UploadScene disabled={busy} onSelect={selectFile} />
        </div>
      </header>
      <ImageryViewer key={sceneId ?? "empty"} sceneId={sceneId} evidence={result?.evidence} selected={selectedEvidence} onSelect={setSelectedEvidence} focusRequest={focusRequest} />
    </section>

    <aside aria-label="Analysis" className="min-h-[480px] min-w-0 overflow-y-auto bg-[#0a141d] lg:min-h-0">
      <QueryPanel question={question} onQuestion={value => { if (pending.current) return; resetAnalysis(); setQuestion(value); }} phase={phase} hasScene={!!sceneId} onAnalyze={runAnalysis} />
      {!result && <div className="flex h-full min-h-[420px] flex-col">
        <div className="flex flex-1 justify-center px-8 pt-[18vh] text-center">
          <div className="max-w-[260px]">
            <Aperture className="mx-auto text-slate-700" size={21} />
            <p className="eyebrow mt-4">SatQuery</p>
            <h2 className="mt-2 text-sm font-semibold text-slate-300">Ask a question about the loaded satellite scene.</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600">Answers, spatial evidence, and provenance will appear here.</p>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3"><span className="font-mono text-[9px] font-bold tracking-[0.12em] text-slate-500">{phase}</span>{plan && <span className="truncate font-mono text-[9px] text-accent">{plan.selected_capability}</span>}</div>
          <p className={`mt-1.5 text-[11px] leading-relaxed ${phase === "UNAVAILABLE" || phase === "ERROR" ? "text-warning" : "text-slate-500"}`}>{message}</p>
          {plan?.provider && <p className="mt-1 font-mono text-[9px] text-slate-600">provider {plan.provider}</p>}
        </div>
      </div>}
      {result && <><AnalysisResult result={result} /><EvidencePanel report={phase === "SUCCESS" && reportContext ? { result, context: reportContext } : undefined} trace={result.trace} evidence={result.evidence ?? null} selected={selectedEvidence} onSelect={setSelectedEvidence} onFocus={index => setFocusRequest({ index, nonce: Date.now() })} onVerify={verify} verification={verification} verifying={verifying} verificationError={verificationError} /></>}
    </aside>
  </div>;
}
